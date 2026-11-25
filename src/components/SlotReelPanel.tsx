import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine.ts';
import {
  classifyMomentum,
  createIdleSpin,
  createMidCherryWinSpin,
  createRareTriggerWinSpin,
  createReachEyeWinSpin,
  createSevenWinSpin,
  createSkullLoseSpin,
  createSkullOmenLoseSpin,
  rollLoseSequencePattern,
  rollSlotSpin,
  rollWinSequencePattern,
  type PaylineId,
  type SlotMomentum,
  type SlotRole,
  type SlotSpinResult,
  type SlotSymbol,
} from '../game/slotEngine.ts';
import type { Position, SettlementResult } from '../game/types.ts';
import { SlotSymbolArt } from './SlotSymbolArt.tsx';

interface SlotReelPanelProps {
  position: Position | null;
  progress: number;
  progressDelta: number;
  pendingWinSettlement: SettlementResult | null;
  pendingLoseSettlement: SettlementResult | null;
  settlement: SettlementResult | null;
  onMidCherryActiveChange: (active: boolean) => void;
  onSevenAligned: () => void;
  onCompletePendingWin: () => void;
  onSkullAligned: () => void;
  onCompletePendingLose: () => void;
}

/** 高速回転中にスクロールさせる図柄帯（ドクロも含めて緊張感を演出） */
const SPIN_BAND: readonly SlotSymbol[] = [
  'SEVEN',
  'CHERRY',
  'WATERMELON',
  'BELL',
  'REPLAY',
  'BAR',
  'SKULL',
  'SEVEN',
  'CHERRY',
  'WATERMELON',
  'BELL',
  'REPLAY',
  'BAR',
  'SKULL',
];

const CYCLE_INTERVAL_MS = 3000;

/** 3つ揃い役判定用 */
const THREE_ALIGNED_ROLES = new Set<SlotRole>([
  'SEVEN',
  'SKULL',
  'TRIPLE_CHERRY',
  'WATERMELON',
  'BELL',
  'REPLAY',
]);

/** 5ラインのSVG座標（viewBox 300x156 に合わせた図柄中心貫通ライン） */
const PAYLINE_COORDS: Record<
  PaylineId,
  { x1: number; y1: number; x2: number; y2: number }
> = {
  TOP: { x1: 6, y1: 26, x2: 294, y2: 26 },
  MID: { x1: 6, y1: 78, x2: 294, y2: 78 },
  BOT: { x1: 6, y1: 130, x2: 294, y2: 130 },
  DIAG_DOWN: { x1: 12, y1: 6, x2: 288, y2: 150 },
  DIAG_UP: { x1: 12, y1: 150, x2: 288, y2: 6 },
};

function getLineStrokeColor(role: SlotRole): string {
  switch (role) {
    case 'SEVEN':
      return '#fde047';
    case 'TRIPLE_CHERRY':
      return '#fb7185';
    case 'WATERMELON':
      return '#4ade80';
    case 'BELL':
      return '#facc15';
    case 'REPLAY':
      return '#22d3ee';
    case 'SKULL':
      return '#a855f7';
    default:
      return '#64748b';
  }
}

function getRoleBadgeStyle(role: SlotRole): string {
  switch (role) {
    case 'SEVEN':
      return 'border-yellow-300/80 bg-amber-500/25 text-yellow-200';
    case 'MID_CHERRY':
      return 'border-pink-400/80 bg-fuchsia-500/25 text-pink-200';
    case 'REACH_EYE':
      return 'border-amber-300/80 bg-cyan-500/20 text-amber-200';
    case 'TRIPLE_CHERRY':
      return 'border-rose-400/70 bg-rose-500/20 text-rose-200';
    case 'CHANCE_EYE':
      return 'border-purple-400/70 bg-purple-500/20 text-purple-200';
    case 'WATERMELON':
      return 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200';
    case 'WEAK_CHERRY':
      return 'border-rose-400/60 bg-rose-500/15 text-rose-200';
    case 'BELL':
      return 'border-amber-400/70 bg-amber-500/20 text-amber-200';
    case 'REPLAY':
      return 'border-cyan-400/70 bg-cyan-500/20 text-cyan-200';
    case 'SKULL':
      return 'border-purple-500/70 bg-purple-950/80 text-purple-200';
    default:
      return 'border-slate-800 bg-slate-900/80 text-slate-500';
  }
}

function getShortRoleLabel(role: SlotRole): string {
  switch (role) {
    case 'SEVEN':
      return 'BONUS';
    case 'MID_CHERRY':
      return '中段🍒';
    case 'REACH_EYE':
      return 'リーチ目';
    case 'TRIPLE_CHERRY':
      return '3連🍒';
    case 'CHANCE_EYE':
      return 'チャンス目';
    case 'WATERMELON':
      return 'スイカ';
    case 'WEAK_CHERRY':
      return 'チェリー';
    case 'BELL':
      return 'ベル';
    case 'REPLAY':
      return 'リプレイ';
    case 'SKULL':
      return '💀';
    default:
      return 'ハズレ';
  }
}

/**
 * 値動き・演出段階に応じた筐体LEDランプの色と発光スタイルを返す（文字なしの色示唆）
 */
function getMoodLampClass(params: {
  momentum: SlotMomentum;
  isActive: boolean;
  isSevenAligned: boolean;
  isMidCherry: boolean;
  isReachEye: boolean;
  isSkullOmen: boolean;
  isSkull: boolean;
}): string {
  const {
    momentum,
    isActive,
    isSevenAligned,
    isMidCherry,
    isReachEye,
    isSkullOmen,
    isSkull,
  } = params;
  if (isSevenAligned) {
    return 'animate-lamp-rainbow shadow-[0_0_18px_rgba(250,204,21,0.85)]';
  }
  if (isMidCherry) {
    return 'bg-gradient-to-r from-fuchsia-500 via-amber-300 to-rose-500 shadow-[0_0_18px_rgba(236,72,153,0.9)] animate-pulse';
  }
  if (isReachEye) {
    return 'bg-gradient-to-r from-amber-300 via-cyan-400 to-amber-300 shadow-[0_0_16px_rgba(250,204,21,0.75)] animate-pulse';
  }
  if (isSkull) {
    return 'bg-gradient-to-r from-purple-800 via-rose-800 to-purple-800 shadow-[0_0_12px_rgba(168,85,247,0.7)] animate-pulse';
  }
  if (isSkullOmen) {
    return 'bg-gradient-to-r from-purple-900 via-fuchsia-950 to-purple-900 shadow-[0_0_12px_rgba(168,85,247,0.65)] animate-pulse';
  }
  if (!isActive) {
    return 'bg-slate-800/75';
  }
  switch (momentum) {
    case 'fast_win':
      return 'bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 shadow-[0_0_14px_rgba(244,63,94,0.75)] animate-pulse';
    case 'mild_win':
      return 'bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
    case 'stagnant':
      return 'bg-cyan-400/75 shadow-[0_0_10px_rgba(34,211,238,0.45)]';
    case 'toward_lose':
      return 'bg-indigo-900/90 shadow-[0_0_8px_rgba(67,56,202,0.45)]';
  }
}

/**
 * 本格パチスロ5ライン有効・出目演出ユニット
 */
export function SlotReelPanel({
  position,
  progress,
  progressDelta,
  pendingWinSettlement,
  pendingLoseSettlement,
  settlement,
  onMidCherryActiveChange,
  onSevenAligned,
  onCompletePendingWin,
  onSkullAligned,
  onCompletePendingLose,
}: SlotReelPanelProps) {
  const [spinResult, setSpinResult] = useState<SlotSpinResult>(() =>
    createIdleSpin(),
  );
  const [spinning, setSpinning] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [flashPayline, setFlashPayline] = useState(false);
  const [history, setHistory] = useState<SlotRole[]>([]);
  const [localPhase, setLocalPhase] = useState<
    'idle' | 'mid_cherry' | 'reach_eye' | 'seven' | 'skull_omen' | 'skull'
  >('idle');

  // タイマー内から最新値・コールバックを参照するための Ref
  const progressRef = useRef(progress);
  const progressDeltaRef = useRef(progressDelta);
  const onMidCherryActiveChangeRef = useRef(onMidCherryActiveChange);
  const onSevenAlignedRef = useRef(onSevenAligned);
  const onCompletePendingWinRef = useRef(onCompletePendingWin);
  const onSkullAlignedRef = useRef(onSkullAligned);
  const onCompletePendingLoseRef = useRef(onCompletePendingLose);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    progressDeltaRef.current = progressDelta;
  }, [progressDelta]);

  useEffect(() => {
    onMidCherryActiveChangeRef.current = onMidCherryActiveChange;
  }, [onMidCherryActiveChange]);

  useEffect(() => {
    onSevenAlignedRef.current = onSevenAligned;
  }, [onSevenAligned]);

  useEffect(() => {
    onCompletePendingWinRef.current = onCompletePendingWin;
  }, [onCompletePendingWin]);

  useEffect(() => {
    onSkullAlignedRef.current = onSkullAligned;
  }, [onSkullAligned]);

  useEffect(() => {
    onCompletePendingLoseRef.current = onCompletePendingLose;
  }, [onCompletePendingLose]);

  const clearAllTimers = () => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    timersRef.current = [];
  };

  // 新規エントリー時に小役履歴をリセット
  useEffect(() => {
    if (position?.id) {
      setHistory([]);
    }
  }, [position?.id]);

  // スロット回転シーケンスのメイン制御
  useEffect(() => {
    clearAllTimers();

    // 1. 負け確定時（ドクロ前兆50% / ダイレクト中段ドクロ50%）
    if (pendingLoseSettlement) {
      const losePattern = rollLoseSequencePattern();
      const skullSpin = createSkullLoseSpin();

      const scheduleSkullSpin = (startAtMs: number) => {
        const s0 = window.setTimeout(() => {
          setLocalPhase('idle');
          setSpinResult(skullSpin);
          setSpinning([true, true, true]);
          setFlashPayline(false);
          if (startAtMs > 0) {
            soundEngine.playLeverOn();
          }
          soundEngine.playReelStart();
        }, startAtMs);

        const s1 = window.setTimeout(() => {
          setSpinning([false, true, true]);
          soundEngine.playReelStop(false);
        }, startAtMs + 350);

        const s2 = window.setTimeout(() => {
          setSpinning([false, false, true]);
          soundEngine.playReelStop(false);
        }, startAtMs + 750);

        const s3 = window.setTimeout(() => {
          setSpinning([false, false, false]);
          setFlashPayline(true);
          setLocalPhase('skull');
          setHistory((prev) => ['SKULL' as const, ...prev].slice(0, 5));
          onSkullAlignedRef.current();
        }, startAtMs + 1250);

        const s4 = window.setTimeout(() => {
          setLocalPhase('idle');
          onCompletePendingLoseRef.current();
        }, startAtMs + 2750);

        timersRef.current.push(s0, s1, s2, s3, s4);
      };

      if (losePattern === 'direct_skull') {
        scheduleSkullSpin(0);
        return () => clearAllTimers();
      }

      // ドクロ前兆（2個以上停止）→ 次回転で中段ドクロ揃い
      const omenSpin = createSkullOmenLoseSpin();
      setLocalPhase('idle');
      setSpinResult(omenSpin);
      setSpinning([true, true, true]);
      setFlashPayline(false);
      soundEngine.playReelStart();

      const o1 = window.setTimeout(() => {
        setSpinning([false, true, true]);
        soundEngine.playReelStop(false);
      }, 320);

      const o2 = window.setTimeout(() => {
        setSpinning([false, false, true]);
        soundEngine.playReelStop(false);
      }, 650);

      const o3 = window.setTimeout(() => {
        setSpinning([false, false, false]);
        setLocalPhase('skull_omen');
        soundEngine.playSkullOmen();
      }, 1000);

      timersRef.current.push(o1, o2, o3);
      scheduleSkullSpin(2400);
      return () => clearAllTimers();
    }

    // 2. 勝ち確定時（中段チェリー25% / 突然7揃い25% / リーチ目25% / 通常レア役25%）
    if (pendingWinSettlement) {
      const winPattern = rollWinSequencePattern();
      const sevenSpin = createSevenWinSpin();

      const scheduleSecondSpinSeven = (startAtMs: number) => {
        const s0 = window.setTimeout(() => {
          setLocalPhase('idle');
          onMidCherryActiveChangeRef.current(false);
          setSpinResult(sevenSpin);
          setSpinning([true, true, true]);
          setFlashPayline(false);
          soundEngine.playLeverOn();
          soundEngine.playReelStart();
        }, startAtMs);

        const s1 = window.setTimeout(() => {
          setSpinning([false, true, true]);
          soundEngine.playReelStop(true);
        }, startAtMs + 450);

        const s2 = window.setTimeout(() => {
          setSpinning([false, false, true]);
          soundEngine.playReelTenpai();
        }, startAtMs + 900);

        const s3 = window.setTimeout(() => {
          setSpinning([false, false, false]);
          setFlashPayline(true);
          setLocalPhase('seven');
          setHistory((prev) => ['SEVEN' as const, ...prev].slice(0, 5));
          onSevenAlignedRef.current();
        }, startAtMs + 1600);

        const s4 = window.setTimeout(() => {
          setLocalPhase('idle');
          onCompletePendingWinRef.current();
        }, startAtMs + 4050);

        timersRef.current.push(s0, s1, s2, s3, s4);
      };

      if (winPattern === 'direct_seven') {
        // パターンA: 突然中段7揃い（25%）
        setLocalPhase('idle');
        onMidCherryActiveChangeRef.current(false);
        setSpinResult(sevenSpin);
        setSpinning([true, true, true]);
        setFlashPayline(false);
        soundEngine.playReelStart();

        const d1 = window.setTimeout(() => {
          setSpinning([false, true, true]);
          soundEngine.playReelStop(true);
        }, 380);
        const d2 = window.setTimeout(() => {
          setSpinning([false, false, true]);
          soundEngine.playReelTenpai();
        }, 800);
        const d3 = window.setTimeout(() => {
          setSpinning([false, false, false]);
          setFlashPayline(true);
          setLocalPhase('seven');
          setHistory((prev) => ['SEVEN' as const, ...prev].slice(0, 5));
          onSevenAlignedRef.current();
        }, 1500);
        const d4 = window.setTimeout(() => {
          setLocalPhase('idle');
          onCompletePendingWinRef.current();
        }, 3950);

        timersRef.current.push(d1, d2, d3, d4);
        return () => clearAllTimers();
      }

      if (winPattern === 'mid_cherry') {
        // パターンB: 中段チェリー → 次回転中段7揃い（25%）
        const midCherrySpin = createMidCherryWinSpin();
        setLocalPhase('idle');
        onMidCherryActiveChangeRef.current(false);
        setSpinResult(midCherrySpin);
        setSpinning([true, true, true]);
        setFlashPayline(false);
        soundEngine.playReelStart();

        const m1 = window.setTimeout(() => {
          setSpinning([false, true, true]);
          soundEngine.playReelStop(true);
        }, 350);
        const m2 = window.setTimeout(() => {
          setSpinning([false, false, true]);
          soundEngine.playReelStop(false);
        }, 700);
        const m3 = window.setTimeout(() => {
          setSpinning([false, false, false]);
          setFlashPayline(true);
          setLocalPhase('mid_cherry');
          setHistory((prev) => ['MID_CHERRY' as const, ...prev].slice(0, 5));
          soundEngine.playSlotRoleHit('MID_CHERRY');
          onMidCherryActiveChangeRef.current(true);
        }, 1050);

        timersRef.current.push(m1, m2, m3);
        scheduleSecondSpinSeven(2550);
        return () => clearAllTimers();
      }

      if (winPattern === 'reach_eye') {
        // パターンC: 確定リーチ目（中段リプリプ7）→ 次回転中段7揃い（25%）
        const reachSpin = createReachEyeWinSpin();
        setLocalPhase('idle');
        onMidCherryActiveChangeRef.current(false);
        setSpinResult(reachSpin);
        setSpinning([true, true, true]);
        setFlashPayline(false);
        soundEngine.playReelStart();

        const r1 = window.setTimeout(() => {
          setSpinning([false, true, true]);
          soundEngine.playReelStop(false);
        }, 350);
        const r2 = window.setTimeout(() => {
          setSpinning([false, false, true]);
          soundEngine.playReelStop(false);
        }, 700);
        const r3 = window.setTimeout(() => {
          setSpinning([false, false, false]);
          setLocalPhase('reach_eye');
          setHistory((prev) => ['REACH_EYE' as const, ...prev].slice(0, 5));
          soundEngine.playReachEye();
        }, 1100);

        timersRef.current.push(r1, r2, r3);
        scheduleSecondSpinSeven(2700);
        return () => clearAllTimers();
      }

      // パターンD: 通常レア役（角チェリー/スイカ/チャンス目/3連チェリー）→ 次回転中段7揃い（25%）
      const rareSpin = createRareTriggerWinSpin();
      setLocalPhase('idle');
      onMidCherryActiveChangeRef.current(false);
      setSpinResult(rareSpin);
      setSpinning([true, true, true]);
      setFlashPayline(false);
      soundEngine.playReelStart();

      const t1 = window.setTimeout(() => {
        setSpinning([false, true, true]);
        soundEngine.playReelStop(false);
      }, 350);
      const t2 = window.setTimeout(() => {
        setSpinning([false, false, true]);
        soundEngine.playReelStop(false);
      }, 700);
      const t3 = window.setTimeout(() => {
        setSpinning([false, false, false]);
        setHistory((prev) => [rareSpin.role, ...prev].slice(0, 5));
        if (
          rareSpin.role === 'WEAK_CHERRY' ||
          rareSpin.role === 'WATERMELON' ||
          rareSpin.role === 'CHANCE_EYE' ||
          rareSpin.role === 'TRIPLE_CHERRY'
        ) {
          setFlashPayline(true);
          soundEngine.playSlotRoleHit(rareSpin.role);
        }
      }, 1050);

      timersRef.current.push(t1, t2, t3);
      scheduleSecondSpinSeven(2550);
      return () => clearAllTimers();
    }

    // 3. ポジション未保有時（待機・決着オーバーレイ表示中）は回転停止
    if (!position || settlement) {
      setLocalPhase('idle');
      setSpinning([false, false, false]);
      setFlashPayline(false);
      return;
    }

    // 4. ポジション保有中: 3秒サイクルで自動回転＆停止
    const runNormalCycle = () => {
      setLocalPhase('idle');
      setFlashPayline(false);
      setSpinning([true, true, true]);
      soundEngine.playReelStart();

      let rolled: SlotSpinResult | null = null;

      // 左リール停止直前に最新の進捗・進捗速度を評価して厳密5ライン出目を決定
      const t1 = window.setTimeout(() => {
        const momentum = classifyMomentum(
          progressDeltaRef.current,
          progressRef.current,
        );
        rolled = rollSlotSpin(momentum);
        setSpinResult(rolled);
        setSpinning([false, true, true]);
        soundEngine.playReelStop(false);
      }, 750);

      const t2 = window.setTimeout(() => {
        setSpinning([false, false, true]);
        soundEngine.playReelStop(false);
      }, 1020);

      const t3 = window.setTimeout(() => {
        setSpinning([false, false, false]);
        soundEngine.playReelStop(false);
        if (rolled) {
          setHistory((prev) => [rolled!.role, ...prev].slice(0, 5));
          if (
            rolled.role === 'MID_CHERRY' ||
            rolled.role === 'TRIPLE_CHERRY' ||
            rolled.role === 'CHANCE_EYE' ||
            rolled.role === 'WATERMELON' ||
            rolled.role === 'WEAK_CHERRY' ||
            rolled.role === 'BELL' ||
            rolled.role === 'REPLAY'
          ) {
            setFlashPayline(true);
            soundEngine.playSlotRoleHit(rolled.role);
          }
        }
      }, 1300);

      timersRef.current.push(t1, t2, t3);
    };

    runNormalCycle();
    const intervalId = window.setInterval(runNormalCycle, CYCLE_INTERVAL_MS);
    timersRef.current.push(intervalId);

    return () => clearAllTimers();
  }, [
    position?.id,
    pendingWinSettlement,
    pendingLoseSettlement,
    settlement?.outcome,
    Boolean(settlement),
  ]);

  const liveMomentum = classifyMomentum(progressDelta, progress);
  const allStopped = !spinning[0] && !spinning[1] && !spinning[2];
  const hasActiveHit =
    allStopped && spinResult.role !== 'MISS' && spinResult.highlightCells.length > 0;
  const showSinglePayline =
    allStopped &&
    flashPayline &&
    THREE_ALIGNED_ROLES.has(spinResult.role) &&
    spinResult.winningLines.length > 0;
  const lineColor = getLineStrokeColor(spinResult.role);

  const moodLampClass = getMoodLampClass({
    momentum: liveMomentum,
    isActive: Boolean(position),
    isSevenAligned: localPhase === 'seven',
    isMidCherry: localPhase === 'mid_cherry',
    isReachEye: localPhase === 'reach_eye',
    isSkullOmen: localPhase === 'skull_omen',
    isSkull: localPhase === 'skull' || settlement?.outcome === 'LOSE',
  });

  const isHighlightedCell = (reel: 0 | 1 | 2, row: 0 | 1 | 2) =>
    spinResult.highlightCells.some((c) => c.reel === reel && c.row === row);

  const showRoleText = allStopped && spinResult.label !== '';

  return (
    <aside
      aria-label="スロット出目演出ユニット"
      data-testid="slot-reel-panel"
      className={`flex h-full w-full flex-col justify-between gap-3 overflow-y-auto p-3.5 transition-all ${
        localPhase === 'seven'
          ? 'bg-gradient-to-b from-[#231238] via-[#130c24] to-[#080b16] shadow-[inset_0_0_32px_rgba(250,204,21,0.28)]'
          : localPhase === 'mid_cherry'
            ? 'bg-gradient-to-b from-[#2b0c27] via-[#17091b] to-[#080a14] shadow-[inset_0_0_28px_rgba(236,72,153,0.3)]'
            : localPhase === 'reach_eye'
              ? 'bg-gradient-to-b from-[#1e1b0d] via-[#0e1422] to-[#070911] shadow-[inset_0_0_26px_rgba(250,204,21,0.22)]'
              : localPhase === 'skull' || localPhase === 'skull_omen'
                ? 'bg-gradient-to-b from-[#1f0b24] via-[#13091a] to-[#07080f] shadow-[inset_0_0_28px_rgba(168,85,247,0.28)]'
                : 'bg-gradient-to-b from-[#11162a] via-[#090d19] to-[#060810]'
      }`}
    >
      {/* 上部: コンパクトタイトル + 状況示唆LEDランプバー（色のみで示唆） */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-black tracking-widest text-amber-300 ring-1 ring-amber-400/50">
              SLOT
            </span>
            <span className="text-xs font-black tracking-wider text-slate-200">
              出目リール
            </span>
          </div>

          <span
            data-testid="slot-role-label"
            className={`min-w-[48px] rounded border px-2 py-0.5 text-center text-[10px] font-bold transition-colors ${
              showRoleText
                ? getRoleBadgeStyle(spinResult.role)
                : 'border-slate-800 bg-slate-900/70 text-slate-500'
            }`}
          >
            {showRoleText ? spinResult.label : '--'}
          </span>
        </div>

        {/* 筐体トップLED状況示唆ランプ（文字なし） */}
        <div className="rounded-lg border border-slate-800/90 bg-[#04060c] p-1.5">
          <div
            data-testid="slot-mood-lamp"
            aria-label="状況示唆ランプ"
            className={`h-2.5 w-full rounded-full transition-all duration-300 ${moodLampClass}`}
          />
        </div>
      </div>

      {/* 中央: 5ライン有効 3リール × 3段 リールウィンドウ */}
      <div
        className={`relative rounded-xl border-2 bg-[#03050a] p-2.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.95)] transition-all duration-200 ${
          localPhase === 'mid_cherry'
            ? 'border-pink-400/90 shadow-[0_0_22px_rgba(236,72,153,0.55),inset_0_0_24px_rgba(0,0,0,0.95)]'
            : localPhase === 'reach_eye'
              ? 'border-amber-300/90 shadow-[0_0_22px_rgba(250,204,21,0.45),inset_0_0_24px_rgba(0,0,0,0.95)]'
              : localPhase === 'seven'
                ? 'border-yellow-300/90 shadow-[0_0_24px_rgba(250,204,21,0.55),inset_0_0_24px_rgba(0,0,0,0.95)]'
                : localPhase === 'skull_omen' || localPhase === 'skull'
                  ? 'border-purple-500/80 shadow-[0_0_18px_rgba(168,85,247,0.45),inset_0_0_24px_rgba(0,0,0,0.95)]'
                  : 'border-slate-600/80'
        }`}
      >
        <div className="relative">
          {/* 3つ揃い役成立時のみ、対象1ラインに細くシャープな光線を描画 */}
          {showSinglePayline && (
            <svg
              viewBox="0 0 300 156"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            >
              {(() => {
                const lineId = spinResult.winningLines[0];
                const coord = PAYLINE_COORDS[lineId];
                return (
                  <g>
                    <line
                      x1={coord.x1}
                      y1={coord.y1}
                      x2={coord.x2}
                      y2={coord.y2}
                      stroke={lineColor}
                      strokeWidth="4"
                      strokeOpacity="0.22"
                      strokeLinecap="round"
                    />
                    <line
                      x1={coord.x1}
                      y1={coord.y1}
                      x2={coord.x2}
                      y2={coord.y2}
                      stroke={lineColor}
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}
            </svg>
          )}

          {/* リール3列 */}
          <div className="relative z-10 grid grid-cols-3 gap-2">
            {([0, 1, 2] as const).map((reelIdx) => {
              const isSpin = spinning[reelIdx];
              const column = spinResult.reels[reelIdx];

              return (
                <div
                  key={reelIdx}
                  className="relative h-[156px] overflow-hidden rounded-lg border border-slate-700/90 bg-gradient-to-b from-[#0b1020] via-[#131b31] to-[#0b1020] shadow-[inset_0_10px_14px_rgba(0,0,0,0.8),inset_0_-10px_14px_rgba(0,0,0,0.8)]"
                >
                  {isSpin ? (
                    <div className="animate-reel-spin flex flex-col blur-[0.6px]">
                      {SPIN_BAND.map((sym, idx) => (
                        <div
                          key={idx}
                          className="flex h-[52px] shrink-0 items-center justify-center"
                        >
                          <SlotSymbolArt symbol={sym} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="animate-reel-stop-bounce flex flex-col">
                      {column.map((sym, rowIdx) => {
                        const row = rowIdx as 0 | 1 | 2;
                        const hitCell =
                          hasActiveHit && isHighlightedCell(reelIdx, row);
                        const dimCell = hasActiveHit && !hitCell;
                        return (
                          <div
                            key={`${rowIdx}-${sym}`}
                            className="flex h-[52px] shrink-0 items-center justify-center"
                          >
                            <SlotSymbolArt
                              symbol={sym}
                              highlighted={hitCell}
                              dimmed={dimCell}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* リール曲面の上下シャドウ */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/65 to-transparent"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/65 to-transparent"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 下部: コンパクトな直近出目履歴のみ */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#050811] px-2.5 py-2">
        <span className="shrink-0 text-[10px] font-bold text-slate-500">
          HISTORY
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {history.length === 0 ? (
            <span className="text-[10px] text-slate-600">---</span>
          ) : (
            history.map((role, idx) => (
              <span
                key={idx}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${getRoleBadgeStyle(role)}`}
              >
                {getShortRoleLabel(role)}
              </span>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
