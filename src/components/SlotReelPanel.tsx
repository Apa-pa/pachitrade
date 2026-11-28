import { useEffect, useRef, useState } from 'react';
import lowerPanelImg from '../../asset/body/lower-panel.webp';
import topLampImg from '../../asset/body/top-lamp.webp';
import { soundEngine } from '../audio/soundEngine.ts';
import {
  classifyMomentum,
  createIdleSpin,
  REEL_STRIPS,
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
import {
  resolveLowerPanelMode,
  resolveTopLampLedMode,
  rollLowerPanelBlackout,
} from '../utils/slotCabinetEffects.ts';
import { SlotSymbolArt } from './SlotSymbolArt.tsx';

export type SlotReelVariant = 'desktop' | 'mobile-full' | 'mobile-mini';

interface SlotReelPanelProps {
  position: Position | null;
  progress: number;
  progressDelta: number;
  pendingWinSettlement: SettlementResult | null;
  pendingLoseSettlement: SettlementResult | null;
  settlement: SettlementResult | null;
  sakibareActive?: boolean;
  isRush?: boolean;
  variant?: SlotReelVariant;
  onRequestExpand?: () => void;
  onMidCherryActiveChange: (active: boolean) => void;
  onSevenAligned: () => void;
  onCompletePendingWin: () => void;
  onSkullAligned: () => void;
  onCompletePendingLose: () => void;
}

let hasPreloadedCabinet = false;

/**
 * 筐体上下パーツ（上部ランプ・下パネル）の表示遅延を防ぐため事前デコードする
 */
function preloadCabinetAssets(): void {
  if (hasPreloadedCabinet || typeof Image === 'undefined') return;
  hasPreloadedCabinet = true;
  for (const src of [topLampImg, lowerPanelImg]) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = src;
    img.decode?.().catch(() => {});
  }
}

preloadCabinetAssets();

/** 高速回転中にスクロールさせる各リール固有の12コマ×2周（24コマ）図柄帯 */
const SPIN_BANDS: readonly [
  readonly SlotSymbol[],
  readonly SlotSymbol[],
  readonly SlotSymbol[],
] = [
  [...REEL_STRIPS[0], ...REEL_STRIPS[0]],
  [...REEL_STRIPS[1], ...REEL_STRIPS[1]],
  [...REEL_STRIPS[2], ...REEL_STRIPS[2]],
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
  sakibareActive = false,
  isRush = false,
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
  const [lowerPanelBlackout, setLowerPanelBlackout] = useState(false);

  // タイマー内から最新値・コールバックを参照するための Ref
  const progressRef = useRef(progress);
  const progressDeltaRef = useRef(progressDelta);
  const prevPendingWinRef = useRef(false);
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

  // 勝ち確定突入時に稀な下パネル消灯（激熱演出）を1回だけ抽選し、終了時に必ず戻す
  useEffect(() => {
    const wasPendingWin = prevPendingWinRef.current;
    prevPendingWinRef.current = hasPendingWin;

    if (!wasPendingWin && hasPendingWin) {
      setLowerPanelBlackout(rollLowerPanelBlackout());
    } else if (!hasPendingWin) {
      setLowerPanelBlackout(false);
    }
  }, [hasPendingWin]);

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

  const isWinSettled =
    settlement?.outcome === 'WIN' || settlement?.outcome === 'COMEBACK_WIN';
  const isLoseSettled = settlement?.outcome === 'LOSE';

  const topLampLedMode = resolveTopLampLedMode({
    hasPosition: Boolean(position),
    progress,
    sakibareActive,
    localPhase,
    hasPendingWin,
    hasPendingLose,
    isWinSettled,
    isLoseSettled,
  });

  const lowerPanelMode = resolveLowerPanelMode({
    isRush,
    localPhase,
    hasPendingWin,
    isBlackout: lowerPanelBlackout,
    isWinSettled,
    isLoseSettled,
  });

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
      data-led-mode={topLampLedMode}
      data-lower-panel-mode={lowerPanelMode}
      className="flex h-full w-full flex-col overflow-hidden bg-[#06080e]"
    >
      {/* 3段一体スロット筐体ステージ（コンテナ比率追従でリサイズ・モバイル時も崩れず収まる） */}
      <div
        className={`slot-cabinet-stage flex min-h-0 flex-1 items-center justify-center ${
          isMobileFull ? 'p-1' : 'p-1.5'
        }`}
      >
        <div className="slot-cabinet-frame flex flex-col overflow-hidden rounded-xl bg-[#090b10] shadow-[0_10px_32px_rgba(0,0,0,0.85)]">
          {/* 1段目: 上部ランプ（中央TRADE RUSHはそのまま、左右LED無彩色領域のみ状態連動発光） */}
          <div className="relative w-full shrink-0 isolate select-none">
            <img
              src={topLampImg}
              alt="TRADE RUSH 上部ランプ"
              draggable={false}
              loading="eager"
              decoding="sync"
              className="block h-auto w-full"
            />
            <div
              aria-hidden="true"
              data-testid="top-lamp-led-left"
              className={`slot-top-lamp-led-left slot-led-${topLampLedMode}`}
            >
              <div className="slot-led-glow absolute inset-0" />
              <div className="slot-led-color absolute inset-0" />
            </div>
            <div
              aria-hidden="true"
              data-testid="top-lamp-led-right"
              className={`slot-top-lamp-led-right slot-led-${topLampLedMode}`}
            >
              <div className="slot-led-glow absolute inset-0" />
              <div className="slot-led-color absolute inset-0" />
            </div>
          </div>

          {/* 2段目: 中段リール描画エリア（左右ダークガンメタル枠で上下パーツと隙間なく密着） */}
          <div className="relative z-10 -my-px flex min-h-0 flex-1 flex-col bg-gradient-to-r from-[#0d1016] via-[#1a1f28] to-[#0d1016] px-[4%] py-[2.5%]">
            <div
              className={`relative flex min-h-0 flex-1 flex-col justify-center rounded-lg border-2 bg-[#03050a] p-1.5 shadow-[inset_0_0_24px_rgba(0,0,0,0.95)] transition-colors duration-200 sm:p-2 ${
                localPhase === 'mid_cherry'
                  ? 'border-pink-400/90 shadow-[0_0_22px_rgba(236,72,153,0.55),inset_0_0_24px_rgba(0,0,0,0.95)]'
                  : localPhase === 'reach_eye'
                    ? 'border-amber-300/90 shadow-[0_0_22px_rgba(250,204,21,0.45),inset_0_0_24px_rgba(0,0,0,0.95)]'
                    : localPhase === 'seven'
                      ? 'border-yellow-300/90 shadow-[0_0_24px_rgba(250,204,21,0.55),inset_0_0_24px_rgba(0,0,0,0.95)]'
                      : localPhase === 'skull_omen' || localPhase === 'skull'
                        ? 'border-purple-500/80 shadow-[0_0_18px_rgba(168,85,247,0.45),inset_0_0_24px_rgba(0,0,0,0.95)]'
                        : 'border-[#2b3240]'
              }`}
            >
              <div className="relative h-full w-full">
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
                <div className="relative z-10 grid h-full grid-cols-3 gap-1.5 sm:gap-2">
                  {([0, 1, 2] as const).map((reelIdx) => {
                    const isSpin = spinning[reelIdx];
                    const column = spinResult.reels[reelIdx];

                    return (
                      <div
                        key={reelIdx}
                        className="relative isolate h-full overflow-hidden rounded-lg bg-gradient-to-b from-[#cbd5e1] via-[#edf1f6] to-[#cbd5e1] shadow-[inset_0_10px_14px_rgba(15,23,42,0.28),inset_0_-10px_14px_rgba(15,23,42,0.28)] ring-1 ring-inset ring-slate-400/90 [clip-path:inset(0_round_0.5rem)]"
                      >
                        {isSpin ? (
                          <div
                            key="spinning"
                            style={{
                              height: 'calc(100% * 24 / 3)',
                              gridTemplateRows: 'repeat(24, minmax(0, 1fr))',
                            }}
                            className="animate-reel-spin grid"
                          >
                            {SPIN_BANDS[reelIdx].map((sym, idx) => (
                              <div
                                key={idx}
                                className="flex min-h-0 items-center justify-center overflow-hidden"
                              >
                                <SlotSymbolArt symbol={sym} size="lg" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            key="stopped"
                            className="animate-reel-stop-bounce grid h-full grid-rows-3"
                          >
                            {column.map((sym, rowIdx) => {
                              const row = rowIdx as 0 | 1 | 2;
                              const hitCell =
                                hasActiveHit && isHighlightedCell(reelIdx, row);
                              const dimCell = hasActiveHit && !hitCell;
                              return (
                                <div
                                  key={rowIdx}
                                  className="relative flex min-h-0 items-center justify-center overflow-hidden"
                                >
                                  <SlotSymbolArt
                                    symbol={sym}
                                    highlighted={hitCell}
                                    dimmed={dimCell}
                                    size="lg"
                                  />
                                  {dimCell && (
                                    <div
                                      aria-hidden="true"
                                      className="pointer-events-none absolute inset-0 bg-slate-900/15"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* リール曲面の上下シャドウ */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-slate-900/35 via-slate-800/10 to-transparent"
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-slate-900/35 via-slate-800/10 to-transparent"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 3段目: 下パネル（通常明るさ控えめ / WIN・RUSH時点灯 / 勝ち確定時稀に消灯） */}
          <div
            data-testid="slot-lower-panel"
            className={`relative w-full shrink-0 select-none transition-[filter,box-shadow] duration-200 slot-lower-panel-${lowerPanelMode}`}
          >
            <img
              src={lowerPanelImg}
              alt="PACHI-TRADE 下パネル"
              draggable={false}
              loading="eager"
              decoding="sync"
              className="block h-auto w-full"
            />
            {lowerPanelMode === 'blackout' && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-black/80"
              />
            )}
          </div>
        </div>
      </div>

      {/* 最下部: コンパクトな直近出目履歴バー */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800/80 bg-[#050811] px-2.5 py-1">
        <span className="shrink-0 text-[9px] font-bold tracking-wider text-slate-500">
          HISTORY
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {history.length === 0 ? (
            <span className="text-[10px] text-slate-600">---</span>
          ) : (
            history.map((role, idx) => (
              <span
                key={idx}
                className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${getRoleBadgeStyle(role)}`}
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
