import { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine.ts';
import {
  classifyMomentum,
  createIdleSpin,
  type PaylineId,
  type SlotMomentum,
  type SlotRole,
  type SlotSpinResult,
  type SlotSymbol,
} from '../game/slotEngine.ts';
import {
  SlotSpinSequencer,
  type SlotLocalPhase,
} from '../game/slotSequencer.ts';
import type { Position, SettlementResult } from '../game/types.ts';
import { SlotSymbolArt } from './SlotSymbolArt.tsx';

export type SlotReelVariant = 'desktop' | 'mobile-full' | 'mobile-mini';

interface SlotReelPanelProps {
  position: Position | null;
  progress: number;
  progressDelta: number;
  pendingWinSettlement: SettlementResult | null;
  pendingLoseSettlement: SettlementResult | null;
  settlement: SettlementResult | null;
  variant?: SlotReelVariant;
  onRequestExpand?: () => void;
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
  variant = 'desktop',
  onRequestExpand,
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
  const [localPhase, setLocalPhase] = useState<SlotLocalPhase>('idle');
  const [isNormalCycleActive, setIsNormalCycleActive] = useState(false);

  // タイマー内から最新値・コールバックを参照するための Ref
  const progressRef = useRef(progress);
  const progressDeltaRef = useRef(progressDelta);
  const onMidCherryActiveChangeRef = useRef(onMidCherryActiveChange);
  const onSevenAlignedRef = useRef(onSevenAligned);
  const onCompletePendingWinRef = useRef(onCompletePendingWin);
  const onSkullAlignedRef = useRef(onSkullAligned);
  const onCompletePendingLoseRef = useRef(onCompletePendingLose);
  const sequencerRef = useRef<SlotSpinSequencer | null>(null);

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

  // 新規エントリー時に小役履歴をリセット
  useEffect(() => {
    if (position?.id) {
      setHistory([]);
    }
  }, [position?.id]);

  // スロット回転シーケンサーのライフサイクル管理（マウント時生成・アンマウント時破棄）
  useEffect(() => {
    const sequencer = new SlotSpinSequencer({
      getProgress: () => progressRef.current,
      getProgressDelta: () => progressDeltaRef.current,
      onSpinResultChange: (result) => setSpinResult(result),
      onSpinningChange: (nextSpinning) => setSpinning(nextSpinning),
      onFlashPaylineChange: (flash) => setFlashPayline(flash),
      onLocalPhaseChange: (phase) => setLocalPhase(phase),
      onNormalCycleActiveChange: (active) => setIsNormalCycleActive(active),
      onAppendHistory: (role) =>
        setHistory((prev) => [role, ...prev].slice(0, 5)),
      onMidCherryActiveChange: (active) =>
        onMidCherryActiveChangeRef.current(active),
      onSevenAligned: () => onSevenAlignedRef.current(),
      onCompletePendingWin: () => onCompletePendingWinRef.current(),
      onSkullAligned: () => onSkullAlignedRef.current(),
      onCompletePendingLose: () => onCompletePendingLoseRef.current(),
      playLeverOn: () => soundEngine.playLeverOn(),
      playReelStart: () => soundEngine.playReelStart(),
      playReelStop: (isSeven) => soundEngine.playReelStop(isSeven),
      playReelTenpai: () => soundEngine.playReelTenpai(),
      playSlotRoleHit: (role) => soundEngine.playSlotRoleHit(role),
      playReachEye: () => soundEngine.playReachEye(),
      playSkullOmen: () => soundEngine.playSkullOmen(),
    });
    sequencerRef.current = sequencer;

    return () => {
      sequencer.dispose();
      if (sequencerRef.current === sequencer) {
        sequencerRef.current = null;
      }
    };
  }, []);

  const hasPendingWin = Boolean(pendingWinSettlement);
  const hasPendingLose = Boolean(pendingLoseSettlement);
  const hasSettlement = Boolean(settlement);

  // 進行中の回転・出目表示を切断しないようシーケンサーへ状態を同期
  useEffect(() => {
    sequencerRef.current?.sync({
      positionId: position?.id ?? null,
      hasPendingWin,
      hasPendingLose,
      hasSettlement,
    });
  }, [position?.id, hasPendingWin, hasPendingLose, hasSettlement]);

  const liveMomentum = classifyMomentum(progressDelta, progress);
  const effectiveMomentum = position ? liveMomentum : spinResult.momentum;
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
    momentum: effectiveMomentum,
    isActive: Boolean(position) || isNormalCycleActive,
    isSevenAligned: localPhase === 'seven',
    isMidCherry: localPhase === 'mid_cherry',
    isReachEye: localPhase === 'reach_eye',
    isSkullOmen: localPhase === 'skull_omen',
    isSkull: localPhase === 'skull' || settlement?.outcome === 'LOSE',
  });

  const isHighlightedCell = (reel: 0 | 1 | 2, row: 0 | 1 | 2) =>
    spinResult.highlightCells.some((c) => c.reel === reel && c.row === row);

  const showRoleText = allStopped && spinResult.label !== '';
  const isMobileFull = variant === 'mobile-full';

  // スマホでチャート拡大中のミニスロットバー表示（シーケンサーを維持するため同一コンポーネント内で分岐）
  if (variant === 'mobile-mini') {
    return (
      <aside
        aria-label="スロット出目ミニ表示"
        data-testid="slot-reel-panel"
        className="flex h-full w-full flex-col justify-between gap-1.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-[#11162a] via-[#090d19] to-[#11162a] px-2.5 py-2"
      >
        <div className="rounded-full border border-slate-800/90 bg-[#04060c] p-0.5">
          <div
            data-testid="slot-mood-lamp"
            aria-label="状況示唆ランプ"
            className={`h-1.5 w-full rounded-full transition-all duration-300 ${moodLampClass}`}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-black text-amber-300 ring-1 ring-amber-400/40">
              SLOT
            </span>

            {!allStopped ? (
              <span className="animate-pulse font-mono text-xs font-bold tracking-widest text-amber-300">
                ▶ 回転中 ▶
              </span>
            ) : (
              <div className="flex items-center gap-1">
                {([0, 1, 2] as const).map((reelIdx) => (
                  <div
                    key={reelIdx}
                    className="flex h-7 w-9 items-center justify-center rounded border border-slate-400/90 bg-gradient-to-b from-[#cbd5e1] via-[#edf1f6] to-[#cbd5e1] shadow-inner"
                  >
                    <SlotSymbolArt
                      symbol={spinResult.reels[reelIdx][1]}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )}

            <span
              data-testid="slot-role-label"
              className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                showRoleText
                  ? getRoleBadgeStyle(spinResult.role)
                  : 'border-slate-800 bg-slate-900/70 text-slate-400'
              }`}
            >
              {allStopped ? (showRoleText ? spinResult.label : '--') : '回転中'}
            </span>
          </div>

          {onRequestExpand && (
            <button
              type="button"
              onClick={onRequestExpand}
              className="cursor-pointer shrink-0 rounded-full border border-amber-400/70 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-200 transition hover:bg-amber-500/35 active:scale-95"
            >
              🎰 リールへ
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="スロット出目演出ユニット"
      data-testid="slot-reel-panel"
      className={`flex h-full w-full flex-col justify-between transition-all ${
        isMobileFull
          ? 'slot-reel-mobile-full gap-1.5 overflow-hidden p-2'
          : 'slot-reel-desktop gap-3 overflow-y-auto p-3.5'
      } ${
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
      <div className={isMobileFull ? 'space-y-1.5' : 'space-y-2.5'}>
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
        <div className="rounded-lg border border-slate-800/90 bg-[#04060c] p-1">
          <div
            data-testid="slot-mood-lamp"
            aria-label="状況示唆ランプ"
            className={`w-full rounded-full transition-all duration-300 ${
              isMobileFull ? 'h-2' : 'h-2.5'
            } ${moodLampClass}`}
          />
        </div>
      </div>

      {/* 中央: 5ライン有効 3リール × 3段 リールウィンドウ */}
      <div
        className={`relative flex flex-1 flex-col justify-center rounded-xl border-2 bg-[#03050a] shadow-[inset_0_0_24px_rgba(0,0,0,0.95)] transition-all duration-200 ${
          isMobileFull ? 'p-2' : 'p-2.5'
        } ${
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
          {/* 3つ揃い役成立時のみ、対象1ラインに細くシャープな光線を描画（白系リールで映える暗縁付き2層） */}
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
                      stroke="#0f172a"
                      strokeWidth="4.8"
                      strokeOpacity="0.48"
                      strokeLinecap="round"
                    />
                    <line
                      x1={coord.x1}
                      y1={coord.y1}
                      x2={coord.x2}
                      y2={coord.y2}
                      stroke={lineColor}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}
            </svg>
          )}

          {/* リール3列（図柄が際立つ白とグレーの中間曲面背景） */}
          <div className="relative z-10 grid grid-cols-3 gap-2">
            {([0, 1, 2] as const).map((reelIdx) => {
              const isSpin = spinning[reelIdx];
              const column = spinResult.reels[reelIdx];

              return (
                <div
                  key={reelIdx}
                  style={{ height: 'calc(var(--reel-cell-h) * 3)' }}
                  className="relative overflow-hidden rounded-lg border border-slate-400/90 bg-gradient-to-b from-[#cbd5e1] via-[#edf1f6] to-[#cbd5e1] shadow-[inset_0_10px_14px_rgba(15,23,42,0.28),inset_0_-10px_14px_rgba(15,23,42,0.28)]"
                >
                  {isSpin ? (
                    <div className="animate-reel-spin flex flex-col blur-[0.6px]">
                      {SPIN_BAND.map((sym, idx) => (
                        <div
                          key={idx}
                          style={{ height: 'var(--reel-cell-h)' }}
                          className="flex shrink-0 items-center justify-center"
                        >
                          <SlotSymbolArt
                            symbol={sym}
                            size="lg"
                          />
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
                            style={{ height: 'var(--reel-cell-h)' }}
                            className="flex shrink-0 items-center justify-center"
                          >
                            <SlotSymbolArt
                              symbol={sym}
                              highlighted={hitCell}
                              dimmed={dimCell}
                              size="lg"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* リール曲面の上下シャドウ */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-slate-900/35 via-slate-800/10 to-transparent"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-slate-900/35 via-slate-800/10 to-transparent"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 下部: コンパクトな直近出目履歴のみ */}
      <div
        className={`flex items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-[#050811] ${
          isMobileFull ? 'px-2 py-1' : 'px-2.5 py-2'
        }`}
      >
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
