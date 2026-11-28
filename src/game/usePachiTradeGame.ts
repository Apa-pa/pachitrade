import { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine.ts';
import {
  createPriceFeed,
  type Candle,
  type FeedMode,
  type FeedStatus,
  type InstrumentMeta,
  type PriceFeed,
  type PriceTick,
} from '../feeds/index.ts';
import {
  loadEffectPattern,
  saveEffectPattern,
  type EffectPatternId,
} from './effects.ts';
import {
  applySettlementToStats,
  createPosition,
  evaluatePositionTick,
  recordEntryToStats,
} from './engine.ts';
import {
  appendTradeRecord,
  clampMaxHistoryCount,
  clearTradeHistoryStorage,
  createTradeRecord,
  loadStatsProfile,
  loadTradeHistory,
  MAX_PLAYER_NAME_LENGTH,
  saveStatsProfile,
  saveTradeHistory,
  trimTradeHistory,
} from './statsHistory.ts';
import { loadStats, resetStatsStorage, saveStats } from './storage.ts';
import type {
  EffectStage,
  GameStats,
  Position,
  SettlementResult,
  Side,
  StatsProfile,
  TradeRecord,
} from './types.ts';

/** 先バレ発生確率（約20%・フェイクあり） */
const SAKIBARE_PROBABILITY = 0.2;
/** 先バレフラッシュ表示時間（ms） */
const SAKIBARE_DURATION_MS = 850;
/** 進捗速度を計測する参照ウィンドウ（ms） */
const DELTA_WINDOW_MS = 2500;

interface ProgressSample {
  time: number;
  progress: number;
}

/**
 * パチスロ風トレードゲームの状態・フィード・効果音・演出パターンを一元管理するカスタムフック
 */
export function usePachiTradeGame() {
  const [mode, setMode] = useState<FeedMode>('realtime');
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [effectPattern, setEffectPattern] = useState<EffectPatternId>(() =>
    loadEffectPattern(),
  );

  const [status, setStatus] = useState<FeedStatus>('connecting');
  const [statusMessage, setStatusMessage] = useState<string>(
    '接続を初期化しています...',
  );
  const [meta, setMeta] = useState<InstrumentMeta>(() =>
    createPriceFeed('realtime').meta,
  );
  const [initialCandles, setInitialCandles] = useState<Candle[]>([]);
  const [candlesRevision, setCandlesRevision] = useState(0);
  const [latestCandle, setLatestCandle] = useState<Candle | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  // デフォルト目標幅（長期戦を避けるため ±30）
  const [targetWidth, setTargetWidth] = useState<number>(
    () => createPriceFeed('realtime').meta.defaultTargetWidth,
  );
  const [position, setPosition] = useState<Position | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [progressDelta, setProgressDelta] = useState<number>(0);
  const [currentPnl, setCurrentPnl] = useState<number>(0);
  const [effectStage, setEffectStage] = useState<EffectStage>('neutral');
  const [sakibareActive, setSakibareActive] = useState(false);
  const [pendingWinSettlement, setPendingWinSettlement] =
    useState<SettlementResult | null>(null);
  const [midCherryActive, setMidCherryActive] = useState(false);
  const [sevenAligned, setSevenAligned] = useState(false);
  const [pendingLoseSettlement, setPendingLoseSettlement] =
    useState<SettlementResult | null>(null);
  const [skullAligned, setSkullAligned] = useState(false);
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [stats, setStats] = useState<GameStats>(() => loadStats());
  const [statsProfile, setStatsProfile] = useState<StatsProfile>(() =>
    loadStatsProfile(),
  );
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>(() =>
    loadTradeHistory(statsProfile.maxHistoryCount),
  );
  const [muted, setMuted] = useState(false);

  // 高頻度ティックコールバック内から最新ステートを同期参照するためのRef
  const positionRef = useRef<Position | null>(null);
  const statsRef = useRef<GameStats>(stats);
  const tradeHistoryRef = useRef<TradeRecord[]>(tradeHistory);
  const maxHistoryCountRef = useRef<number>(statsProfile.maxHistoryCount);
  const currentPriceRef = useRef<number | null>(null);
  const effectStageRef = useRef<EffectStage>('neutral');
  const effectPatternRef = useRef<EffectPatternId>(effectPattern);
  const pendingWinSettlementRef = useRef<SettlementResult | null>(null);
  const sevenAlignedRef = useRef<boolean>(false);
  const pendingLoseSettlementRef = useRef<SettlementResult | null>(null);
  const skullAlignedRef = useRef<boolean>(false);
  const progressHistoryRef = useRef<ProgressSample[]>([]);
  const sakibareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedRef = useRef<PriceFeed | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    maxHistoryCountRef.current = statsProfile.maxHistoryCount;
  }, [statsProfile.maxHistoryCount]);

  useEffect(() => {
    effectPatternRef.current = effectPattern;
  }, [effectPattern]);

  /** 勝利用ファンファーレ再生ヘルパー */
  const playWinSound = useCallback((result: SettlementResult) => {
    if (result.outcome === 'COMEBACK_WIN') {
      soundEngine.playComebackWin();
    } else {
      soundEngine.playWin();
    }
  }, []);

  /** フィードからのティック処理 */
  const handleTick = useCallback(
    (tick: PriceTick) => {
      setPrevPrice(currentPriceRef.current);
      currentPriceRef.current = tick.price;
      setCurrentPrice(tick.price);

      const activePos = positionRef.current;
      if (!activePos) return;

      const evaluation = evaluatePositionTick(
        activePos,
        tick.price,
        statsRef.current,
        tick.pricePath,
      );

      if (evaluation.settlement) {
        // 決着処理（二重決済を防ぐため即座に Ref をクリアし戦績を確定）
        positionRef.current = null;
        effectStageRef.current = 'neutral';
        progressHistoryRef.current = [];

        const nextStats = applySettlementToStats(
          statsRef.current,
          evaluation.settlement.outcome,
          activePos.targetWidth,
        );
        statsRef.current = nextStats;
        saveStats(nextStats);

        const nextRecord = createTradeRecord(evaluation.settlement);
        const nextHistory = appendTradeRecord(
          tradeHistoryRef.current,
          nextRecord,
          maxHistoryCountRef.current,
        );
        tradeHistoryRef.current = nextHistory;
        saveTradeHistory(nextHistory);
        setTradeHistory(nextHistory);

        setPosition(null);
        setStats(nextStats);
        setProgress(evaluation.snapshot.clampedProgress);
        setProgressDelta(0);
        setCurrentPnl(evaluation.settlement.pnl);
        setEffectStage('neutral');

        if (evaluation.settlement.outcome === 'LOSE') {
          // 負け確定時: スロット出目演出ではドクロを揃えてから負け画面へ
          if (effectPatternRef.current === 'slot') {
            pendingLoseSettlementRef.current = evaluation.settlement;
            skullAlignedRef.current = false;
            setSkullAligned(false);
            setPendingLoseSettlement(evaluation.settlement);
            return;
          }
          setSettlement(evaluation.settlement);
          soundEngine.playLose();
          return;
        }

        // 勝ち確定時: スロット出目演出ではまず7を揃えて少し待ってから勝ち画面へ
        if (effectPatternRef.current === 'slot') {
          pendingWinSettlementRef.current = evaluation.settlement;
          sevenAlignedRef.current = false;
          setSevenAligned(false);
          setPendingWinSettlement(evaluation.settlement);
          return;
        }

        // ネオン演出では即座に勝ち画面へ
        setSettlement(evaluation.settlement);
        playWinSound(evaluation.settlement);
        return;
      }

      // 保有中の進捗・進捗速度・演出ステージ更新
      const now = Date.now();
      const currentProg = evaluation.snapshot.clampedProgress;
      const history = progressHistoryRef.current;
      history.push({ time: now, progress: currentProg });

      // 約2.5秒前の基準サンプルを探す
      const targetTime = now - DELTA_WINDOW_MS;
      let baselineIndex = 0;
      for (let i = 0; i < history.length; i++) {
        if (history[i].time <= targetTime) {
          baselineIndex = i;
        } else {
          break;
        }
      }
      // 不要になった古いサンプルを切り捨て（基準点は1つ残す）
      if (baselineIndex > 0) {
        history.splice(0, baselineIndex);
      }
      const baseline = history[0];
      const delta = baseline ? currentProg - baseline.progress : 0;

      positionRef.current = evaluation.updatedPosition;
      setPosition(evaluation.updatedPosition);
      setProgress(currentProg);
      setProgressDelta(delta);
      setCurrentPnl(evaluation.snapshot.rawPnl);

      const prevStage = effectStageRef.current;
      const nextStage = evaluation.effectStage;
      if (prevStage !== nextStage) {
        effectStageRef.current = nextStage;
        setEffectStage(nextStage);
        if (effectPatternRef.current === 'neon') {
          if (nextStage === 'gekiatsu') {
            soundEngine.playGekiatsuCutin();
          } else if (nextStage === 'pinch') {
            soundEngine.playPinchWarning();
          }
        }
      }
    },
    [playWinSound],
  );

  /** フィード起動・切替時のライフサイクル管理 */
  useEffect(() => {
    let cancelled = false;

    // モード切替・再接続時は進行中のポジションを戦績無傷で安全にリセット
    positionRef.current = null;
    effectStageRef.current = 'neutral';
    currentPriceRef.current = null;
    pendingWinSettlementRef.current = null;
    sevenAlignedRef.current = false;
    pendingLoseSettlementRef.current = null;
    skullAlignedRef.current = false;
    progressHistoryRef.current = [];
    setPosition(null);
    setProgress(0);
    setProgressDelta(0);
    setCurrentPnl(0);
    setEffectStage('neutral');
    setPendingWinSettlement(null);
    setMidCherryActive(false);
    setSevenAligned(false);
    setPendingLoseSettlement(null);
    setSkullAligned(false);
    setSettlement(null);
    setLatestCandle(null);
    setCurrentPrice(null);
    setPrevPrice(null);

    const feed = createPriceFeed(mode);
    feedRef.current = feed;
    setMeta(feed.meta);
    setStatus('connecting');
    setStatusMessage(
      mode === 'realtime'
        ? 'Binance から直近チャートを読み込み中...'
        : 'DEMO 疑似チャートを生成中...',
    );

    const boot = async () => {
      try {
        const candles = await feed.getInitialCandles();
        if (cancelled) return;

        setInitialCandles(candles);
        setCandlesRevision((rev) => rev + 1);

        const lastCandle = candles[candles.length - 1];
        if (lastCandle) {
          currentPriceRef.current = lastCandle.close;
          setCurrentPrice(lastCandle.close);
          setLatestCandle(lastCandle);
        }

        feed.start({
          onTick: handleTick,
          onCandleUpdate: (candle) => {
            if (!cancelled) {
              setLatestCandle(candle);
            }
          },
          onStatusChange: (nextStatus, message) => {
            if (cancelled) return;
            setStatus(nextStatus);
            if (message) {
              setStatusMessage(message);
            }
          },
        });
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : '初期データの取得に失敗しました';
        setStatus('error');
        setStatusMessage(
          `データ取得エラー (${msg})。DEMOモードへ切り替えてお試しください。`,
        );
      }
    };

    void boot();

    return () => {
      cancelled = true;
      feed.stop();
      if (feedRef.current === feed) {
        feedRef.current = null;
      }
    };
  }, [mode, reconnectNonce, handleTick]);

  /** ネオン演出選択時の +60%（chance）/ +80%（gekiatsu）鼓動SEループ */
  useEffect(() => {
    if (effectPattern !== 'neon') return;
    if (!position) return;
    if (effectStage !== 'chance' && effectStage !== 'gekiatsu') return;

    const isIntense = effectStage === 'gekiatsu';
    const intervalMs = isIntense ? 430 : 720;

    soundEngine.playHeartbeat(isIntense);
    const timer = setInterval(() => {
      soundEngine.playHeartbeat(isIntense);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [effectPattern, position !== null, effectStage]);

  /** 先バレタイマーのクリーンアップ */
  useEffect(() => {
    return () => {
      if (sakibareTimerRef.current) {
        clearTimeout(sakibareTimerRef.current);
      }
    };
  }, []);

  /** ポジション保有中（未決着状態）のページ離脱・リロードを警告する */
  useEffect(() => {
    if (!position) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chromium系・レガシーブラウザ互換のため returnValue に空文字を設定
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [position !== null]);

  /** エントリー（レバーON） */
  const enterPosition = useCallback(
    (side: Side) => {
      const price = currentPriceRef.current;
      if (
        price === null ||
        positionRef.current !== null ||
        pendingWinSettlementRef.current !== null ||
        pendingLoseSettlementRef.current !== null ||
        settlement !== null
      ) {
        return;
      }

      const validWidth =
        Number.isFinite(targetWidth) && targetWidth > 0
          ? targetWidth
          : meta.defaultTargetWidth;

      // 最初のユーザー操作で AudioContext をアンロックしレバー音再生
      soundEngine.unlock();
      soundEngine.playLeverOn();

      // 約20%で先バレ演出（フェイクあり：勝敗ロジックとは独立）
      const isSakibare = Math.random() < SAKIBARE_PROBABILITY;
      if (isSakibare) {
        soundEngine.playSakibare();
        setSakibareActive(true);
        if (sakibareTimerRef.current) {
          clearTimeout(sakibareTimerRef.current);
        }
        sakibareTimerRef.current = setTimeout(() => {
          setSakibareActive(false);
        }, SAKIBARE_DURATION_MS);
      }

      const newPos = createPosition(side, price, validWidth, isSakibare);
      positionRef.current = newPos;
      effectStageRef.current = 'neutral';
      progressHistoryRef.current = [{ time: Date.now(), progress: 0 }];

      // 途中離脱（戦績改ざん）を可視化するためエントリー時点で開始回数を永続化
      const nextStats = recordEntryToStats(statsRef.current);
      statsRef.current = nextStats;
      saveStats(nextStats);
      setStats(nextStats);

      setPosition(newPos);
      setProgress(0);
      setProgressDelta(0);
      setCurrentPnl(0);
      setEffectStage('neutral');
    },
    [targetWidth, meta.defaultTargetWidth, settlement],
  );

  /** 勝ち確定中の中段チェリー降臨状態の切り替え */
  const notifyMidCherryHit = useCallback((active: boolean) => {
    setMidCherryActive(active);
  }, []);

  /** スロットで 7・7・7 が3つ揃った瞬間に呼ばれる通知 */
  const notifySevenAligned = useCallback(() => {
    const pending = pendingWinSettlementRef.current;
    if (!pending || sevenAlignedRef.current) return;

    sevenAlignedRef.current = true;
    setMidCherryActive(false);
    setSevenAligned(true);
    playWinSound(pending);
  }, [playWinSound]);

  /** 7揃い後の待機時間を経て勝ち画面オーバーレイを表示する */
  const completePendingWin = useCallback(() => {
    const pending = pendingWinSettlementRef.current;
    if (!pending) return;

    pendingWinSettlementRef.current = null;
    sevenAlignedRef.current = false;
    setPendingWinSettlement(null);
    setMidCherryActive(false);
    setSevenAligned(false);
    setSettlement(pending);
  }, []);

  /** スロットで ドクロ が3つ揃った瞬間に呼ばれる通知 */
  const notifySkullAligned = useCallback(() => {
    const pending = pendingLoseSettlementRef.current;
    if (!pending || skullAlignedRef.current) return;

    skullAlignedRef.current = true;
    setSkullAligned(true);
    soundEngine.playSkullAligned();
  }, []);

  /** ドクロ揃い後の短い余韻を経て負け画面オーバーレイを表示する */
  const completePendingLose = useCallback(() => {
    const pending = pendingLoseSettlementRef.current;
    if (!pending) return;

    pendingLoseSettlementRef.current = null;
    skullAlignedRef.current = false;
    setPendingLoseSettlement(null);
    setSkullAligned(false);
    setSettlement(pending);
    soundEngine.playLose();
  }, []);

  /** 演出パターンの切り替え */
  const changeEffectPattern = useCallback(
    (next: EffectPatternId) => {
      soundEngine.unlock();
      effectPatternRef.current = next;
      setEffectPattern(next);
      saveEffectPattern(next);

      // 777揃い演出・ドクロ揃い演出中に別演出へ切り替えた場合はフリーズを防ぐため即決着表示
      if (next !== 'slot' && pendingWinSettlementRef.current) {
        const pending = pendingWinSettlementRef.current;
        const alreadyPlayed = sevenAlignedRef.current;
        pendingWinSettlementRef.current = null;
        sevenAlignedRef.current = false;
        setPendingWinSettlement(null);
        setMidCherryActive(false);
        setSevenAligned(false);
        setSettlement(pending);
        if (!alreadyPlayed) {
          playWinSound(pending);
        }
      }
      if (next !== 'slot' && pendingLoseSettlementRef.current) {
        const pending = pendingLoseSettlementRef.current;
        pendingLoseSettlementRef.current = null;
        skullAlignedRef.current = false;
        setPendingLoseSettlement(null);
        setSkullAligned(false);
        setSettlement(pending);
        soundEngine.playLose();
      }
    },
    [playWinSound],
  );

  /** 決着オーバーレイを閉じて次のエントリーへ進む */
  const dismissSettlement = useCallback(() => {
    soundEngine.unlock();
    setSettlement(null);
    setProgress(0);
    setProgressDelta(0);
    setCurrentPnl(0);
    setEffectStage('neutral');
  }, []);

  /** モード切替 */
  const switchMode = useCallback((nextMode: FeedMode) => {
    soundEngine.unlock();
    setMode(nextMode);
  }, []);

  /** 手動再接続 */
  const retryConnection = useCallback(() => {
    soundEngine.unlock();
    setReconnectNonce((n) => n + 1);
  }, []);

  /** サウンドON/OFF切替 */
  const toggleMute = useCallback(() => {
    soundEngine.unlock();
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  /** 戦績リセット（通算戦績・トレード履歴を初期化） */
  const resetStats = useCallback(() => {
    soundEngine.unlock();
    const fresh = resetStatsStorage();
    statsRef.current = fresh;
    setStats(fresh);
    const emptyHistory = clearTradeHistoryStorage();
    tradeHistoryRef.current = emptyHistory;
    setTradeHistory(emptyHistory);
  }, []);

  /** プレイヤー名の更新 */
  const updatePlayerName = useCallback((name: string) => {
    const normalized = name.slice(0, MAX_PLAYER_NAME_LENGTH);
    setStatsProfile((prev) => {
      const next = { ...prev, playerName: normalized };
      saveStatsProfile(next);
      return next;
    });
  }, []);

  /** トレード履歴の保存上限件数の更新 */
  const updateMaxHistoryCount = useCallback((count: number) => {
    const clamped = clampMaxHistoryCount(count);
    maxHistoryCountRef.current = clamped;
    setStatsProfile((prev) => {
      const next = { ...prev, maxHistoryCount: clamped };
      saveStatsProfile(next);
      return next;
    });
    const trimmed = trimTradeHistory(tradeHistoryRef.current, clamped);
    tradeHistoryRef.current = trimmed;
    saveTradeHistory(trimmed);
    setTradeHistory(trimmed);
  }, []);

  return {
    mode,
    status,
    statusMessage,
    meta,
    initialCandles,
    candlesRevision,
    latestCandle,
    currentPrice,
    prevPrice,
    targetWidth,
    setTargetWidth,
    position,
    progress,
    progressDelta,
    currentPnl,
    effectPattern,
    effectStage,
    sakibareActive,
    pendingWinSettlement,
    midCherryActive,
    sevenAligned,
    pendingLoseSettlement,
    skullAligned,
    settlement,
    stats,
    tradeHistory,
    statsProfile,
    muted,
    enterPosition,
    notifyMidCherryHit,
    notifySevenAligned,
    completePendingWin,
    notifySkullAligned,
    completePendingLose,
    changeEffectPattern,
    dismissSettlement,
    switchMode,
    retryConnection,
    toggleMute,
    resetStats,
    updatePlayerName,
    updateMaxHistoryCount,
  };
}
