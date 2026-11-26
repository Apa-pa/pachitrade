import type { InstrumentMeta } from '../feeds/index.ts';
import type { EffectStage, Position, Side } from '../game/types.ts';
import { TrendDownIcon, TrendUpIcon, ZapIcon } from './Icons.tsx';
import { SlotSymbolArt } from './SlotSymbolArt.tsx';

interface ControlPanelProps {
  meta: InstrumentMeta;
  currentPrice: number | null;
  targetWidth: number;
  position: Position | null;
  progress: number;
  currentPnl: number;
  effectStage: EffectStage;
  hasSettlement: boolean;
  isCelebratingWin: boolean;
  isMidCherryPhase?: boolean;
  isSevenAligned?: boolean;
  isCelebratingLose: boolean;
  isSkullAligned?: boolean;
  onChangeTargetWidth: (width: number) => void;
  onEnter: (side: Side) => void;
}

/** 進捗バーの色・状態ラベルを返す */
function getStageBadge(stage: EffectStage, minProgress: number) {
  switch (stage) {
    case 'gekiatsu':
      return {
        label: '🔥 激アツ!! リーチ突入',
        className:
          'border-amber-400/80 bg-gradient-to-r from-rose-600/80 to-amber-500/80 text-white shadow-[0_0_16px_rgba(251,191,36,0.55)]',
      };
    case 'chance':
      return {
        label: '⚡ CHANCE!! 鼓動加速中',
        className:
          'border-emerald-400/70 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.35)]',
      };
    case 'blue_aura':
      return {
        label: '💠 青オーラ発光中',
        className:
          'border-cyan-400/70 bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]',
      };
    case 'pinch':
      return {
        label:
          minProgress <= -80
            ? '⚠️ ピンチ!!（逆転大当たり権利あり！）'
            : '⚠️ ピンチ!! 損切りライン接近',
        className:
          'border-rose-500/80 bg-rose-600/30 text-rose-200 animate-pulse',
      };
    default:
      return {
        label: '⚔️ バトル進行中',
        className: 'border-slate-600 bg-slate-800/80 text-slate-300',
      };
  }
}

export function ControlPanel({
  meta,
  currentPrice,
  targetWidth,
  position,
  progress,
  currentPnl,
  effectStage,
  hasSettlement,
  isCelebratingWin,
  isMidCherryPhase = false,
  isSevenAligned = false,
  isCelebratingLose,
  isSkullAligned = false,
  onChangeTargetWidth,
  onEnter,
}: ControlPanelProps) {
  const isLocked =
    position !== null || hasSettlement || isCelebratingWin || isCelebratingLose;
  const canEnter = currentPrice !== null && !isLocked && targetWidth > 0;

  // 待機中に表示する予定 TP / SL 価格プレビュー
  const longTp = currentPrice !== null ? currentPrice + targetWidth : null;
  const longSl = currentPrice !== null ? currentPrice - targetWidth : null;
  const shortTp = currentPrice !== null ? currentPrice - targetWidth : null;
  const shortSl = currentPrice !== null ? currentPrice + targetWidth : null;

  const fmt = (val: number | null) =>
    val === null
      ? '---'
      : val.toLocaleString('en-US', {
          minimumFractionDigits: meta.decimals,
          maximumFractionDigits: meta.decimals,
        });

  const stageInfo = position
    ? getStageBadge(effectStage, position.minProgressReached)
    : null;

  // 進捗バー: 中央50%を0%、左端0%を-100%、右端100%を+100%として描画
  const clamped = Math.max(-100, Math.min(100, progress));
  const barLeftPercent = clamped >= 0 ? 50 : 50 + clamped / 2;
  const barWidthPercent = Math.abs(clamped) / 2;

  return (
    <section
      aria-label="トレード操作・演出ステータス"
      className="@container flex h-full w-full flex-col justify-between gap-1.5 overflow-y-auto bg-gradient-to-b from-[#0d1425] to-[#070b15] p-2 sm:p-2.5"
    >
      {/* 上段: 目標値幅設定 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wider text-cyan-300 uppercase">
            利確 / 損切り 目標幅
          </span>
          <span className="text-[11px] text-slate-400">
            単位: {meta.unit}（エントリー中は変更不可）
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {meta.presetWidths.map((preset) => {
            const active = targetWidth === preset;
            return (
              <button
                key={preset}
                type="button"
                disabled={isLocked}
                onClick={() => onChangeTargetWidth(preset)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                    : 'border-slate-700 bg-slate-900/90 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                ±{preset}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#050811] px-2 py-0.5 focus-within:border-cyan-400">
            <span className="font-mono text-xs font-bold text-slate-400">±</span>
            <input
              type="number"
              min={1}
              step={1}
              disabled={isLocked}
              aria-label="目標値幅（任意入力）"
              value={targetWidth}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) {
                  onChangeTargetWidth(next);
                }
              }}
              className="w-16 bg-transparent text-right font-mono text-xs font-bold text-white outline-none disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-400">{meta.unit}</span>
          </div>
        </div>
      </div>

      {/* 中段・下段: 待機時（エントリーレバー） or 保有中（リアルタイム進捗ゲージ） */}
      {position ? (
        <div className="space-y-2 rounded-xl border border-slate-700/70 bg-[#050812]/90 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-black tracking-wider ${
                  position.side === 'LONG'
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/60'
                    : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/60'
                }`}
              >
                {position.side} 保有中
              </span>
              {position.isSakibare && (
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/70 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-black text-rose-300">
                  <ZapIcon className="h-3 w-3" />
                  先バレ発生
                </span>
              )}
            </div>

            {stageInfo && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${stageInfo.className}`}
              >
                {stageInfo.label}
              </span>
            )}
          </div>

          {/* 逆転権利インジケータ */}
          {position.minProgressReached <= -80 && (
            <div className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/70 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/20 px-2.5 py-1 text-[11px] font-black text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
              <ZapIcon className="h-3.5 w-3.5 text-yellow-300" />
              <span>
                逆転大当たり権利獲得中!!（最大ピンチ {position.minProgressReached.toFixed(0)}%）
              </span>
            </div>
          )}

          {/* 損益 & 進捗率 */}
          <div className="grid grid-cols-2 gap-1.5 text-center @md:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1">
              <p className="text-[10px] text-slate-400">エントリー</p>
              <p className="font-mono text-xs font-bold text-white">
                {fmt(position.entryPrice)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2 py-1">
              <p className="text-[10px] text-emerald-400">TP（利確）</p>
              <p className="font-mono text-xs font-bold text-emerald-300">
                {fmt(position.tpPrice)}
              </p>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2 py-1">
              <p className="text-[10px] text-rose-400">SL（損切）</p>
              <p className="font-mono text-xs font-bold text-rose-300">
                {fmt(position.slPrice)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1">
              <p className="text-[10px] text-slate-400">現在含み損益</p>
              <p
                className={`font-mono text-xs font-black ${
                  currentPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {currentPnl >= 0 ? '+' : ''}
                {currentPnl.toFixed(meta.decimals)} ({progress >= 0 ? '+' : ''}
                {progress.toFixed(0)}%)
              </p>
            </div>
          </div>

          {/* 進捗ゲージ（-100% 〜 +100%） */}
          <div className="space-y-1">
            <div className="relative h-4 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-950">
              {/* 閾値マーカー (-70%, 0%, +30%, +60%, +80%) */}
              <div
                className="absolute top-0 bottom-0 z-10 w-px bg-rose-500/60"
                style={{ left: '15%' }}
                title="-70% ピンチ"
              />
              <div
                className="absolute top-0 bottom-0 z-10 w-0.5 bg-white/60"
                style={{ left: '50%' }}
                title="0%"
              />
              <div
                className="absolute top-0 bottom-0 z-10 w-px bg-cyan-400/60"
                style={{ left: '65%' }}
                title="+30% 青発光"
              />
              <div
                className="absolute top-0 bottom-0 z-10 w-px bg-emerald-400/60"
                style={{ left: '80%' }}
                title="+60% 点滅"
              />
              <div
                className="absolute top-0 bottom-0 z-10 w-px bg-amber-300/80"
                style={{ left: '90%' }}
                title="+80% 激アツ"
              />

              {/* ゲージバー本体 */}
              <div
                className={`absolute top-0 bottom-0 transition-all duration-150 ${
                  progress >= 80
                    ? 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 shadow-[0_0_16px_#fbbf24]'
                    : progress >= 60
                      ? 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                      : progress >= 30
                        ? 'bg-cyan-400'
                        : progress >= 0
                          ? 'bg-emerald-500/80'
                          : progress <= -70
                            ? 'bg-rose-600 shadow-[0_0_14px_#ef4444]'
                            : 'bg-rose-500/80'
                }`}
                style={{
                  left: `${barLeftPercent}%`,
                  width: `${barWidthPercent}%`,
                }}
              />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-slate-400">
              <span className="text-rose-400">-100% SL</span>
              <span className="text-rose-300/80">-70%</span>
              <span className="text-slate-300">0%</span>
              <span className="text-cyan-300">+30%</span>
              <span className="text-emerald-300">+60%</span>
              <span className="text-amber-300">+80% 激アツ</span>
              <span className="text-emerald-400">+100% WIN</span>
            </div>
          </div>
        </div>
      ) : isCelebratingWin ? (
        isSevenAligned ? (
          <div className="animate-rainbow-border flex items-center justify-center rounded-xl border-2 bg-gradient-to-r from-rose-950/60 via-amber-950/60 to-fuchsia-950/60 p-6 text-center">
            <p className="animate-rainbow-text text-2xl font-black tracking-widest sm:text-3xl">
              BONUS 確定
            </p>
          </div>
        ) : isMidCherryPhase ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-pink-400/80 bg-gradient-to-r from-fuchsia-950/70 via-rose-950/60 to-amber-950/60 p-6 shadow-[0_0_24px_rgba(236,72,153,0.3)]">
            <div className="flex items-center gap-3 text-xl font-black tracking-[0.4em] text-pink-300 animate-pulse">
              <span>✦</span>
              <span>✦</span>
              <span>✦</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-700/80 bg-[#050812]/90 p-6">
            <div className="flex items-center gap-3 font-mono text-sm tracking-[0.5em] text-slate-400 animate-pulse">
              <span>•</span>
              <span>•</span>
              <span>•</span>
            </div>
          </div>
        )
      ) : isCelebratingLose ? (
        isSkullAligned ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-purple-500/60 bg-gradient-to-r from-purple-950/60 via-slate-950/80 to-rose-950/50 p-6">
            <div className="animate-pulse opacity-90">
              <SlotSymbolArt symbol="SKULL" size="md" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-700/80 bg-[#050812]/90 p-6">
            <div className="flex items-center gap-3 font-mono text-sm tracking-[0.5em] text-slate-500 animate-pulse">
              <span>•</span>
              <span>•</span>
              <span>•</span>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>方向を選んでレバーON（クリック即エントリー）</span>
            <span className="font-mono text-[11px] text-amber-300/90">
              ⚡ 先バレ期待度 約20%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* SHORT ボタン（左側） */}
            <button
              type="button"
              disabled={!canEnter}
              onClick={() => onEnter('SHORT')}
              className="group min-w-0 cursor-pointer relative overflow-hidden rounded-xl border-2 border-rose-400/70 bg-gradient-to-b from-rose-600/35 via-rose-700/25 to-rose-950/60 px-2.5 py-2 text-left shadow-[0_0_24px_rgba(244,63,94,0.22)] transition-all hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-[0_0_32px_rgba(244,63,94,0.45)] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 @md:px-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-black tracking-wider text-rose-300">
                      SHORT
                    </span>
                    <span className="hidden rounded bg-rose-400/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-200 @sm:inline-block">
                      売り・下落予想
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-1.5 font-mono text-[11px] text-slate-300">
                    <span>
                      TP: <span className="text-emerald-300">{fmt(shortTp)}</span>
                    </span>
                    <span>
                      SL: <span className="text-rose-300">{fmt(shortSl)}</span>
                    </span>
                  </p>
                </div>
                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/50 transition group-hover:scale-110 @sm:flex">
                  <TrendDownIcon className="h-5 w-5" />
                </div>
              </div>
            </button>

            {/* LONG ボタン（右側） */}
            <button
              type="button"
              disabled={!canEnter}
              onClick={() => onEnter('LONG')}
              className="group min-w-0 cursor-pointer relative overflow-hidden rounded-xl border-2 border-emerald-400/70 bg-gradient-to-b from-emerald-600/35 via-emerald-700/25 to-emerald-950/60 px-2.5 py-2 text-left shadow-[0_0_24px_rgba(16,185,129,0.22)] transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_0_32px_rgba(16,185,129,0.45)] active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 @md:px-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-black tracking-wider text-emerald-300">
                      LONG
                    </span>
                    <span className="hidden rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200 @sm:inline-block">
                      買い・上昇予想
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-1.5 font-mono text-[11px] text-slate-300">
                    <span>
                      TP: <span className="text-emerald-300">{fmt(longTp)}</span>
                    </span>
                    <span>
                      SL: <span className="text-rose-300">{fmt(longSl)}</span>
                    </span>
                  </p>
                </div>
                <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50 transition group-hover:scale-110 @sm:flex">
                  <TrendUpIcon className="h-5 w-5" />
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
