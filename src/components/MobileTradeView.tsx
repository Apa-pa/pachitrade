import { useEffect, useRef, useState } from 'react';
import type {
  Candle,
  FeedMode,
  FeedStatus,
  InstrumentMeta,
} from '../feeds/index.ts';
import { EFFECT_PATTERNS, type EffectPatternId } from '../game/effects.ts';
import { isWinningStreak } from '../game/engine.ts';
import type {
  EffectStage,
  GameStats,
  Position,
  SettlementResult,
  Side,
} from '../game/types.ts';
import {
  resolveMobileStageState,
  type MobileFocusMode,
  type MobileNavTab,
} from '../utils/mobileLayout.ts';
import { splitHighlightPrice } from '../utils/priceFormat.ts';
import { ConnectionBanner } from './ConnectionBanner.tsx';
import {
  CandlestickChartIcon,
  CloseIcon,
  FlameIcon,
  MaximizeIcon,
  SettingsIcon,
  SwapHorizontalIcon,
  TrophyIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  ZapIcon,
} from './Icons.tsx';
import { PriceChart } from './PriceChart.tsx';
import { SlotReelPanel } from './SlotReelPanel.tsx';
import { SlotSymbolArt } from './SlotSymbolArt.tsx';

interface MobileTradeViewProps {
  mode: FeedMode;
  status: FeedStatus;
  statusMessage: string;
  meta: InstrumentMeta;
  initialCandles: Candle[];
  candlesRevision: number;
  latestCandle: Candle | null;
  currentPrice: number | null;
  prevPrice: number | null;
  targetWidth: number;
  onChangeTargetWidth: (width: number) => void;
  position: Position | null;
  progress: number;
  progressDelta: number;
  effectPattern: EffectPatternId;
  effectStage: EffectStage;
  pendingWinSettlement: SettlementResult | null;
  midCherryActive: boolean;
  sevenAligned: boolean;
  pendingLoseSettlement: SettlementResult | null;
  skullAligned: boolean;
  settlement: SettlementResult | null;
  stats: GameStats;
  muted: boolean;
  onEnter: (side: Side) => void;
  onMidCherryActiveChange: (active: boolean) => void;
  onSevenAligned: () => void;
  onCompletePendingWin: () => void;
  onSkullAligned: () => void;
  onCompletePendingLose: () => void;
  onSelectPattern: (pattern: EffectPatternId) => void;
  onSwitchMode: (mode: FeedMode) => void;
  onRetryConnection: () => void;
  onToggleMute: () => void;
  onOpenStats: () => void;
}

/** ヘッダーの接続状態インジケータ色 */
function getStatusDotClass(mode: FeedMode, status: FeedStatus): string {
  if (mode === 'demo' && status === 'connected') {
    return 'bg-fuchsia-400 shadow-[0_0_6px_#e879f9]';
  }
  switch (status) {
    case 'connected':
      return 'bg-emerald-400 shadow-[0_0_6px_#34d399]';
    case 'connecting':
    case 'reconnecting':
      return 'bg-amber-400 animate-pulse';
    case 'error':
      return 'bg-rose-500';
    default:
      return 'bg-slate-400';
  }
}

/** 保有中進捗ゲージ右上のコンパクトステージ表示 */
function getCompactStageBadge(stage: EffectStage, minProgress: number) {
  switch (stage) {
    case 'gekiatsu':
      return {
        label: '🔥 激アツ!!',
        className:
          'border-amber-400/80 bg-gradient-to-r from-rose-600/85 to-amber-500/85 text-white',
      };
    case 'chance':
      return {
        label: '⚡ CHANCE!!',
        className: 'border-emerald-400/70 bg-emerald-500/20 text-emerald-300',
      };
    case 'blue_aura':
      return {
        label: '💠 青オーラ',
        className: 'border-cyan-400/70 bg-cyan-500/20 text-cyan-300',
      };
    case 'pinch':
      return {
        label: minProgress <= -80 ? '⚠️ 逆転圏内' : '⚠️ ピンチ!!',
        className: 'border-rose-500/80 bg-rose-600/30 text-rose-200 animate-pulse',
      };
    default:
      return {
        label: '⚔️ バトル中',
        className: 'border-slate-600 bg-slate-800/90 text-slate-300',
      };
  }
}

/**
 * SBI FX 2WAY注文画面をベースにしたスマホ専用（768px未満）トレーディング＆スロットUI
 */
export function MobileTradeView({
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
  onChangeTargetWidth,
  position,
  progress,
  progressDelta,
  effectPattern,
  effectStage,
  pendingWinSettlement,
  midCherryActive,
  sevenAligned,
  pendingLoseSettlement,
  skullAligned,
  settlement,
  stats,
  muted,
  onEnter,
  onMidCherryActiveChange,
  onSevenAligned,
  onCompletePendingWin,
  onSkullAligned,
  onCompletePendingLose,
  onSelectPattern,
  onSwitchMode,
  onRetryConnection,
  onToggleMute,
  onOpenStats,
}: MobileTradeViewProps) {
  const hasPendingSettlement =
    pendingWinSettlement !== null || pendingLoseSettlement !== null;
  const isSettlingNow = hasPendingSettlement || settlement !== null;
  const isRoundActive = position !== null || isSettlingNow;

  const [focusMode, setFocusMode] = useState<MobileFocusMode>(() =>
    isRoundActive && effectPattern === 'slot' ? 'slot' : 'chart',
  );
  const [navTab, setNavTab] = useState<MobileNavTab>('trade');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const prevPositionIdRef = useRef<string | null>(position?.id ?? null);
  const prevSettlingRef = useRef<boolean>(isSettlingNow);
  const wasRoundActiveRef = useRef<boolean>(isRoundActive);

  // エントリー時・決着突入時はスロットメインへ復帰し、完全待機復帰時にチャートへ戻す
  useEffect(() => {
    const posId = position?.id ?? null;
    const isNewEntry = posId !== null && posId !== prevPositionIdRef.current;
    prevPositionIdRef.current = posId;

    const enteredSettling = isSettlingNow && !prevSettlingRef.current;
    prevSettlingRef.current = isSettlingNow;

    if ((isNewEntry || enteredSettling) && effectPattern === 'slot') {
      setFocusMode('slot');
      setNavTab('trade');
      setSettingsOpen(false);
    }

    if (wasRoundActiveRef.current && !isRoundActive) {
      setFocusMode('chart');
    }
    wasRoundActiveRef.current = isRoundActive;
  }, [position?.id, isSettlingNow, isRoundActive, effectPattern]);

  const {
    effectiveFocus,
    isSettlingOrSettled,
    showSlotMiniBar,
    showStageToggle,
  } = resolveMobileStageState({
    effectPattern,
    focusMode,
    navTab,
    hasPosition: position !== null,
    hasPendingSettlement,
    hasSettlement: settlement !== null,
  });

  const isStreak = isWinningStreak(stats);
  const statusDotClass = getStatusDotClass(mode, status);
  const canEnter =
    currentPrice !== null && !isRoundActive && targetWidth > 0;

  const priceParts = splitHighlightPrice(currentPrice, meta.decimals);
  const priceDirection =
    currentPrice !== null && prevPrice !== null
      ? currentPrice > prevPrice
        ? 'up'
        : currentPrice < prevPrice
          ? 'down'
          : 'flat'
      : 'flat';
  const arrowGlyph = priceDirection === 'down' ? '▼' : '▲';
  const arrowClass =
    priceDirection === 'down'
      ? 'text-[11px] font-bold text-amber-400'
      : 'text-[11px] font-bold text-cyan-400';

  const clampedProgress = Math.max(-100, Math.min(100, progress));
  const barLeftPercent = clampedProgress >= 0 ? 50 : 50 + clampedProgress / 2;
  const barWidthPercent = Math.abs(clampedProgress) / 2;
  const stageBadge = position
    ? getCompactStageBadge(effectStage, position.minProgressReached)
    : null;

  const formatEntryPrice = (val: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    });

  /** スロットメイン ⇄ チャート拡大の表示切り替え */
  const handleToggleFocus = () => {
    if (effectPattern === 'neon') {
      onSelectPattern('slot');
      setFocusMode('slot');
    } else if (navTab === 'chart') {
      setFocusMode('slot');
    } else {
      setFocusMode((prev) => (prev === 'slot' ? 'chart' : 'slot'));
    }
    setNavTab('trade');
    setSettingsOpen(false);
  };

  /** ボトムナビタブ選択 */
  const handleSelectNavTab = (tab: MobileNavTab) => {
    setSettingsOpen(false);
    if (tab === 'stats') {
      onOpenStats();
      return;
    }
    setNavTab(tab);
  };

  /** 設定シートを閉じる */
  const handleCloseSheet = () => {
    setSettingsOpen(false);
  };

  /** チャート右上ピルボタン（チャート拡大／リール重視） */
  const chartTopRightPill = !showStageToggle ? null : (
    <button
      type="button"
      data-testid="mobile-stage-toggle"
      onClick={handleToggleFocus}
      className={`cursor-pointer inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-md backdrop-blur-sm transition active:scale-95 ${
        effectiveFocus === 'slot'
          ? 'border-cyan-400/60 bg-[#0d1629]/90 text-cyan-200 hover:bg-cyan-500/25'
          : 'border-amber-400/70 bg-[#1a1308]/90 text-amber-200 hover:bg-amber-500/25'
      }`}
    >
      {effectiveFocus === 'slot' ? (
        <>
          <MaximizeIcon className="h-3 w-3" />
          <span>チャート拡大</span>
        </>
      ) : (
        <span>
          {effectPattern === 'neon' ? '🎰 スロットへ' : '🎰 リール重視'}
        </span>
      )}
    </button>
  );

  const isSheetOpen = settingsOpen;

  return (
    <div
      data-testid="mobile-trade-view"
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#06080f] text-slate-100"
    >
      {/* 1. コンパクト1行ヘッダー */}
      <header className="relative z-20 flex h-[42px] shrink-0 items-center justify-between border-b border-cyan-500/20 bg-[#090d18]/95 px-2.5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-500 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-white">
            777
          </span>
          <span className="truncate text-xs font-black tracking-wide text-white">
            {meta.symbol}
          </span>
          <span
            aria-label={mode === 'demo' ? 'DEMOモード' : `接続状態:${status}`}
            className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`}
          />
          {isStreak ? (
            <span className="animate-streak-glow inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-300/80 bg-gradient-to-r from-rose-600 to-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
              <FlameIcon className="h-3 w-3 text-yellow-200" />
              <span>{stats.streak}連</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
              連 {stats.streak}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
          <span className="text-slate-300">
            <strong className="text-emerald-400">{stats.wins}</strong>勝
            <strong className="text-rose-400">{stats.losses}</strong>敗
          </span>
          <span
            className={`font-black ${
              stats.totalPnl > 0
                ? 'text-emerald-400'
                : stats.totalPnl < 0
                  ? 'text-rose-400'
                  : 'text-slate-200'
            }`}
          >
            {stats.totalPnl >= 0 ? '+' : ''}
            {stats.totalPnl.toFixed(0)}
          </span>
        </div>
      </header>

      {/* 接続エラー / 再接続バナー */}
      <ConnectionBanner
        mode={mode}
        status={status}
        message={statusMessage}
        onSwitchToDemo={() => onSwitchMode('demo')}
        onRetry={onRetryConnection}
      />

      {/* メインボディ領域 */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-between">
        {/* 2. 動的ビジュアルステージ（上: チャート / 下: スロット） */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pt-1.5 pb-1">
          {/* チャートパネル（待機・チャート拡大時は flex-1、スロットメイン時は上104pxミニ表示） */}
          <div
            data-testid="mobile-chart-slot"
            className={`relative flex flex-col overflow-hidden rounded-xl border bg-[#070b14] ${
              effectiveFocus === 'slot'
                ? 'h-[104px] shrink-0 border-slate-700/80'
                : 'min-h-0 flex-1 border-cyan-500/35'
            }`}
          >
            <PriceChart
              initialCandles={initialCandles}
              candlesRevision={candlesRevision}
              latestCandle={latestCandle}
              currentPrice={currentPrice}
              prevPrice={prevPrice}
              meta={meta}
              position={position}
              mobileMode={effectiveFocus === 'slot' ? 'mini' : 'normal'}
              topRightSlot={chartTopRightPill}
              showSakibareBadge={Boolean(position?.isSakibare)}
            />
          </div>

          {/* スロットパネル（slotパターン時は回転タイマーを切らないため常にマウント維持） */}
          {effectPattern === 'slot' && (
            <div
              data-testid="mobile-slot-container"
              className={
                effectiveFocus === 'slot'
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-amber-500/45'
                  : showSlotMiniBar
                    ? 'h-[70px] shrink-0 overflow-hidden'
                    : 'hidden'
              }
            >
              <SlotReelPanel
                position={position}
                progress={progress}
                progressDelta={progressDelta}
                pendingWinSettlement={pendingWinSettlement}
                pendingLoseSettlement={pendingLoseSettlement}
                settlement={settlement}
                variant={effectiveFocus === 'slot' ? 'mobile-full' : 'mobile-mini'}
                onRequestExpand={() => setFocusMode('slot')}
                onMidCherryActiveChange={onMidCherryActiveChange}
                onSevenAligned={onSevenAligned}
                onCompletePendingWin={onCompletePendingWin}
                onSkullAligned={onSkullAligned}
                onCompletePendingLose={onCompletePendingLose}
              />
            </div>
          )}
        </div>

        {/* 3. 下部コントロールエリア（2WAY注文 or 建値付きコンパクトゲージ ＋ 丸アイコンバー） */}
        <div className="shrink-0 space-y-1.5 px-2 pb-1.5">
          {!isRoundActive ? (
            <>
              {/* SBI FX風 2WAY注文パネル（左: 青 SHORT / 中央丸: 目標幅 / 右: 赤 LONG） */}
              <div
                data-testid="mobile-2way-panel"
                className="relative grid grid-cols-2 gap-1.5"
              >
                <button
                  type="button"
                  disabled={!canEnter}
                  onClick={() => onEnter('SHORT')}
                  className="cursor-pointer relative flex flex-col justify-between rounded-xl border-2 border-sky-400 bg-[#0d172a] px-3 py-2 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-sky-400">
                      BID(売) SHORT
                    </span>
                    <span className={arrowClass}>{arrowGlyph}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline font-mono font-black tracking-tight text-white">
                    <span className="text-sm text-slate-200">
                      {priceParts.head}
                    </span>
                    <span className="text-[26px] leading-none">
                      {priceParts.big}
                    </span>
                    <span className="text-xs text-slate-300">
                      {priceParts.tail}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!canEnter}
                  onClick={() => onEnter('LONG')}
                  className="cursor-pointer relative flex flex-col justify-between rounded-xl border-2 border-rose-400 bg-[#0d172a] px-3 py-2 text-right transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="flex items-center justify-between">
                    <span className={arrowClass}>{arrowGlyph}</span>
                    <span className="text-[11px] font-black text-rose-400">
                      LONG (買)ASK
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-end font-mono font-black tracking-tight text-white">
                    <span className="text-sm text-slate-200">
                      {priceParts.head}
                    </span>
                    <span className="text-[26px] leading-none">
                      {priceParts.big}
                    </span>
                    <span className="text-xs text-slate-300">
                      {priceParts.tail}
                    </span>
                  </div>
                </button>

                {/* 中央丸バッジ：目標値幅 */}
                <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-900 shadow-lg">
                  <span className="text-[8px] font-bold leading-none text-slate-500">
                    幅
                  </span>
                  <span className="font-mono text-[11px] font-black leading-tight">
                    ±{targetWidth}
                  </span>
                </div>
              </div>

              {/* 目標値幅設定行（待機中のみ表示して保有中はリールを最大化） */}
              <div className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-800/90 bg-[#090f1d] px-2 py-1.5">
                <span className="shrink-0 text-[10px] font-bold text-slate-400">
                  目標幅
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {meta.presetWidths.map((preset) => {
                    const active = targetWidth === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangeTargetWidth(preset)}
                        className={`cursor-pointer rounded border px-2 py-0.5 font-mono text-[10px] font-bold transition ${
                          active
                            ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                            : 'border-slate-700 bg-slate-900 text-slate-300'
                        }`}
                      >
                        ±{preset}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="目標値幅（任意入力）"
                  value={targetWidth}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      onChangeTargetWidth(next);
                    }
                  }}
                  className="w-12 rounded border border-slate-600 bg-white px-1 py-0.5 text-center font-mono text-[11px] font-bold text-slate-900 outline-none focus:border-cyan-400"
                />
              </div>
            </>
          ) : position ? (
            /* 保有中: リール直下の建値一体型・コンパクト進捗ゲージ（TPSL・含み損益表は廃止） */
            <div
              data-testid="mobile-compact-gauge"
              className="space-y-1.5 rounded-xl border border-slate-700/80 bg-[#0a1222] px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ring-1 ${
                      position.side === 'LONG'
                        ? 'bg-rose-500/20 text-rose-300 ring-rose-400/60'
                        : 'bg-sky-500/20 text-sky-300 ring-sky-400/60'
                    }`}
                  >
                    {position.side}
                  </span>
                  <span className="truncate font-mono text-[11px] font-bold text-slate-200">
                    建値 {formatEntryPrice(position.entryPrice)}
                  </span>
                  {position.minProgressReached <= -80 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-400/70 bg-amber-500/20 px-1 py-0.5 text-[9px] font-black text-amber-200">
                      <ZapIcon className="h-2.5 w-2.5" />
                      逆転権利
                    </span>
                  )}
                </div>

                {stageBadge && (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${stageBadge.className}`}
                  >
                    {stageBadge.label}
                  </span>
                )}
              </div>

              <div className="relative h-3 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-950">
                <div
                  className="absolute top-0 bottom-0 left-[15%] z-10 w-px bg-rose-500/60"
                  title="-70% ピンチ"
                />
                <div
                  className="absolute top-0 bottom-0 left-1/2 z-10 w-0.5 bg-white/70"
                  title="0%"
                />
                <div
                  className="absolute top-0 bottom-0 left-[65%] z-10 w-px bg-cyan-400/60"
                  title="+30% 青オーラ"
                />
                <div
                  className="absolute top-0 bottom-0 left-[80%] z-10 w-px bg-emerald-400/60"
                  title="+60% チャンス"
                />
                <div
                  className="absolute top-0 bottom-0 left-[90%] z-10 w-px bg-amber-300/80"
                  title="+80% 激アツ"
                />
                <div
                  className={`absolute top-0 bottom-0 transition-all duration-150 ${
                    clampedProgress >= 80
                      ? 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 shadow-[0_0_12px_#fbbf24]'
                      : clampedProgress >= 60
                        ? 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                        : clampedProgress >= 30
                          ? 'bg-cyan-400'
                          : clampedProgress >= 0
                            ? 'bg-emerald-500/85'
                            : clampedProgress <= -70
                              ? 'bg-rose-600'
                              : 'bg-rose-500/80'
                  }`}
                  style={{
                    left: `${barLeftPercent}%`,
                    width: `${barWidthPercent}%`,
                  }}
                />
              </div>

              <div className="flex justify-between font-mono text-[9px] text-slate-400">
                <span className="text-rose-400">-100%</span>
                <span>0%</span>
                <span className="text-amber-300">+80%</span>
                <span className="text-emerald-400">+100%</span>
              </div>
            </div>
          ) : pendingWinSettlement ? (
            sevenAligned ? (
              <div className="animate-rainbow-border flex items-center justify-center rounded-xl border-2 bg-gradient-to-r from-rose-950/60 via-amber-950/60 to-fuchsia-950/60 py-2.5 text-center">
                <p className="animate-rainbow-text text-lg font-black tracking-widest">
                  BONUS 確定
                </p>
              </div>
            ) : midCherryActive ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-pink-400/80 bg-gradient-to-r from-fuchsia-950/70 via-rose-950/60 to-amber-950/60 py-2.5">
                <span className="animate-pulse text-base font-black tracking-[0.4em] text-pink-300">
                  ✦ ✦ ✦
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-slate-700/80 bg-[#050812]/90 py-2.5">
                <span className="animate-pulse font-mono text-xs tracking-[0.5em] text-slate-400">
                  • • •
                </span>
              </div>
            )
          ) : pendingLoseSettlement ? (
            skullAligned ? (
              <div className="flex items-center justify-center rounded-xl border-2 border-purple-500/60 bg-gradient-to-r from-purple-950/60 via-slate-950/80 to-rose-950/50 py-2.5">
                <div className="animate-pulse opacity-90">
                  <SlotSymbolArt symbol="SKULL" size="sm" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-slate-700/80 bg-[#050812]/90 py-2.5">
                <span className="animate-pulse font-mono text-xs tracking-[0.5em] text-slate-500">
                  • • •
                </span>
              </div>
            )
          ) : settlement ? (
            settlement.outcome === 'LOSE' ? (
              <div className="flex items-center justify-center rounded-xl border border-purple-500/50 bg-purple-950/35 py-2.5 text-xs font-black tracking-widest text-purple-200">
                💀 決着（LOSE）
              </div>
            ) : (
              <div className="animate-rainbow-border flex items-center justify-center rounded-xl border-2 bg-gradient-to-r from-rose-950/60 via-amber-950/60 to-fuchsia-950/60 py-2.5 text-center">
                <p className="animate-rainbow-text text-base font-black tracking-widest">
                  BONUS 確定
                </p>
              </div>
            )
          ) : null}

          {/* 下部丸アイコンバー（⚙ / サウンド / 演出パターン / メイン切替） */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="font-mono text-[10px] text-slate-400">
              {isRoundActive
                ? `目標幅 ±${targetWidth}`
                : '⚡ 先バレ期待度 約20%'}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="mobile-settings-btn"
                onClick={() => setSettingsOpen((prev) => !prev)}
                aria-label="設定を開く"
                title="設定（LIVE/DEMO・演出・免責）"
                className={`cursor-pointer flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-95 ${
                  settingsOpen
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-600 bg-slate-800/90 text-slate-200 hover:border-cyan-400'
                }`}
              >
                <SettingsIcon className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'サウンドをONにする' : 'サウンドをOFFにする'}
                title="サウンド ON/OFF"
                className={`cursor-pointer flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-95 ${
                  muted
                    ? 'border-slate-700 bg-slate-900 text-rose-400'
                    : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                }`}
              >
                {muted ? (
                  <VolumeOffIcon className="h-4 w-4" />
                ) : (
                  <VolumeOnIcon className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  onSelectPattern(effectPattern === 'slot' ? 'neon' : 'slot')
                }
                aria-label="演出パターン切り替え"
                title={
                  effectPattern === 'slot'
                    ? '現在: スロット出目（タップでネオン演出へ）'
                    : '現在: ネオン演出（タップでスロット出目へ）'
                }
                className={`cursor-pointer flex h-8 w-8 items-center justify-center rounded-full border text-xs transition active:scale-95 ${
                  effectPattern === 'slot'
                    ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                    : 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-300'
                }`}
              >
                {effectPattern === 'slot' ? (
                  <span>🎰</span>
                ) : (
                  <ZapIcon className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                data-testid="mobile-footer-toggle"
                disabled={isSettlingOrSettled}
                onClick={handleToggleFocus}
                className="cursor-pointer inline-flex h-8 items-center gap-1 rounded-full border border-slate-500 bg-slate-800 px-3 text-[11px] font-bold text-white shadow transition hover:border-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SwapHorizontalIcon className="h-3.5 w-3.5 text-cyan-300" />
                <span>
                  {effectiveFocus === 'slot' ? 'チャート' : 'リール'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 4. ボトムシートオーバーレイ（⚙設定） */}
        {isSheetOpen && (
          <div
            data-testid="mobile-bottom-sheet"
            onClick={handleCloseSheet}
            className="absolute inset-0 z-30 flex flex-col justify-end bg-black/65 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="space-y-3 rounded-t-2xl border-t border-slate-700 bg-[#0e1628] p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">⚙ アプリ設定</h2>
                <button
                  type="button"
                  onClick={handleCloseSheet}
                  aria-label="閉じる"
                  className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                  <span>閉じる</span>
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                  <div>
                    <div className="font-bold text-slate-100">
                      データソース
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {position
                        ? '切替時は保有中ポジションが解除されます'
                        : 'REALTIME / DEMO高速生成を切り替え'}
                    </div>
                  </div>
                  <div className="flex rounded-lg border border-slate-700 bg-[#05070e] p-0.5">
                    <button
                      type="button"
                      onClick={() => onSwitchMode('realtime')}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-bold ${
                        mode === 'realtime'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'text-slate-400'
                      }`}
                    >
                      REALTIME
                    </button>
                    <button
                      type="button"
                      onClick={() => onSwitchMode('demo')}
                      className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-bold ${
                        mode === 'demo'
                          ? 'bg-fuchsia-500/20 text-fuchsia-300'
                          : 'text-slate-400'
                      }`}
                    >
                      DEMO
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                  <div>
                    <div className="font-bold text-slate-100">
                      演出パターン
                    </div>
                    <div className="text-[10px] text-slate-400">
                      スロット出目 / ネオンカットイン
                    </div>
                  </div>
                  <div className="flex rounded-lg border border-slate-700 bg-[#05070e] p-0.5">
                    {EFFECT_PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => onSelectPattern(pat.id)}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-bold ${
                          effectPattern === pat.id
                            ? 'bg-amber-500/25 text-amber-200'
                            : 'text-slate-400'
                        }`}
                      >
                        {pat.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-2.5">
                  <span className="font-bold text-slate-100">サウンド</span>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`cursor-pointer rounded-lg border px-3 py-1 text-[11px] font-bold ${
                      muted
                        ? 'border-slate-700 bg-slate-800 text-rose-300'
                        : 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200'
                    }`}
                  >
                    {muted ? 'SOUND OFF' : 'SOUND ON'}
                  </button>
                </div>

                <p className="border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-400">
                  ※本アプリはエンターテインメントおよびトレード練習用のシミュレーションツールです。投資助言を目的としたものではありません。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. ボトムナビゲーション（3タブ構成：2WAY取引 / チャート / 戦績） */}
      <nav
        aria-label="スマホ版メインナビゲーション"
        className="grid shrink-0 grid-cols-3 border-t border-slate-800 bg-[#070b14] pb-[env(safe-area-inset-bottom)] text-[10px]"
      >
        <button
          type="button"
          onClick={() => handleSelectNavTab('trade')}
          className={`cursor-pointer flex h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 transition ${
            !settingsOpen && navTab === 'trade'
              ? 'border-white font-bold text-white'
              : 'border-transparent text-slate-400'
          }`}
        >
          <SwapHorizontalIcon className="h-4 w-4" />
          <span>2WAY取引</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectNavTab('chart')}
          className={`cursor-pointer flex h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 transition ${
            !settingsOpen && navTab === 'chart'
              ? 'border-white font-bold text-white'
              : 'border-transparent text-slate-400'
          }`}
        >
          <CandlestickChartIcon className="h-4 w-4" />
          <span>チャート</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectNavTab('stats')}
          className={`cursor-pointer flex h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 transition ${
            !settingsOpen && navTab === 'stats'
              ? 'border-white font-bold text-white'
              : 'border-transparent text-slate-400'
          }`}
        >
          <TrophyIcon className="h-4 w-4" />
          <span>戦績</span>
        </button>
      </nav>
    </div>
  );
}
