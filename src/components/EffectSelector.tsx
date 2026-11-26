import { EFFECT_PATTERNS, type EffectPatternId } from '../game/effects.ts';
import { LockIcon, RotateCcwIcon, UnlockIcon } from './Icons.tsx';

interface EffectSelectorProps {
  selectedPattern: EffectPatternId;
  locked: boolean;
  onSelectPattern: (pattern: EffectPatternId) => void;
  onToggleLock: () => void;
  onResetLayout: () => void;
}

/**
 * 演出パターン切り替え＆ワークスペース配置操作バー
 */
export function EffectSelector({
  selectedPattern,
  locked,
  onSelectPattern,
  onToggleLock,
  onResetLayout,
}: EffectSelectorProps) {
  const activeMeta =
    EFFECT_PATTERNS.find((p) => p.id === selectedPattern) ?? EFFECT_PATTERNS[0];

  return (
    <section
      aria-label="演出パターン・レイアウト操作"
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-700/80 bg-[#0b101d]/90 px-3.5 py-1.5 shadow-[0_0_20px_rgba(15,23,42,0.55)]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[11px] font-bold tracking-wider text-amber-300">
          演出パターン:
        </span>
        <div
          className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-700/80 bg-[#05070e] p-0.5"
          role="group"
          aria-label="演出パターン切り替え"
        >
          {EFFECT_PATTERNS.map((pattern) => {
            const active = pattern.id === selectedPattern;
            return (
              <button
                key={pattern.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectPattern(pattern.id)}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-bold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-amber-500/25 via-fuchsia-500/25 to-cyan-500/25 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.28)] ring-1 ring-amber-400/60'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {pattern.shortLabel}
              </button>
            );
          })}
        </div>

        <p className="hidden text-[11px] text-slate-400 xl:block">
          {activeMeta.description}
        </p>
      </div>

      {/* 右側: パネル自由配置コントロール（デスクトップ向け） */}
      <div className="hidden items-center gap-2 md:flex">
        <button
          type="button"
          data-testid="toggle-layout-lock"
          onClick={onToggleLock}
          className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
            locked
              ? 'border-slate-600 bg-slate-800/90 text-slate-300 hover:border-slate-500 hover:text-white'
              : 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.22)] hover:bg-cyan-500/25'
          }`}
          title={
            locked
              ? 'クリックしてパネルの移動・リサイズを有効にする'
              : 'クリックして現在の配置を固定する'
          }
        >
          {locked ? (
            <>
              <LockIcon className="h-3.5 w-3.5 text-amber-400" />
              <span>レイアウト固定中</span>
            </>
          ) : (
            <>
              <UnlockIcon className="h-3.5 w-3.5 text-cyan-300" />
              <span>自由配置ON（ドラッグで移動/伸縮）</span>
            </>
          )}
        </button>

        <button
          type="button"
          data-testid="reset-layout-btn"
          onClick={onResetLayout}
          className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-[11px] font-bold text-slate-300 transition hover:border-slate-500 hover:text-white"
          title="パネルの配置とサイズを初期状態に戻す"
        >
          <RotateCcwIcon className="h-3.5 w-3.5" />
          <span>配置リセット</span>
        </button>
      </div>
    </section>
  );
}
