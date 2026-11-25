import type { SlotSymbol } from '../game/slotEngine.ts';

export type SlotSymbolSize = 'sm' | 'md' | 'lg';

interface SlotSymbolArtProps {
  symbol: SlotSymbol;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: SlotSymbolSize;
}

/**
 * 図柄コンテナのサイズ別固定ボックス（今後画像へ差し替える際の共通枠）
 */
const SYMBOL_BOX_CLASS: Record<SlotSymbolSize, string> = {
  sm: 'h-6 w-8',
  md: 'h-10 w-14',
  lg: 'h-16 w-20',
};

const SVG_SIZE_CLASS: Record<SlotSymbolSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-14 w-14',
};

const SEVEN_TEXT_CLASS: Record<SlotSymbolSize, string> = {
  sm: 'text-lg [-webkit-text-stroke:0.8px_#7f1d1d]',
  md: 'text-3xl [-webkit-text-stroke:1.2px_#7f1d1d]',
  lg: 'text-5xl [-webkit-text-stroke:1.6px_#7f1d1d]',
};

const PILL_CLASS: Record<SlotSymbolSize, { box: string; text: string }> = {
  sm: { box: 'h-4 w-8', text: 'text-[7px] tracking-normal' },
  md: { box: 'h-7 w-14', text: 'text-[11px] tracking-wider' },
  lg: { box: 'h-10 w-[72px]', text: 'text-sm tracking-widest' },
};

const BAR_CLASS: Record<SlotSymbolSize, { box: string; text: string }> = {
  sm: { box: 'h-4 w-8', text: 'text-[8px] tracking-normal' },
  md: { box: 'h-7 w-14', text: 'text-xs tracking-widest' },
  lg: { box: 'h-10 w-[72px]', text: 'text-base tracking-[0.2em]' },
};

/**
 * スロットリール用の図柄グラフィック
 * 白〜グレーの明るいリール背景上で高コントラストに映える設計。
 * 今後図柄を画像に差し替える際は、ここを `<img src={...} alt={...} className="h-full w-full object-contain" />` に置き換える。
 */
export function SlotSymbolArt({
  symbol,
  highlighted = false,
  dimmed = false,
  size = 'md',
}: SlotSymbolArtProps) {
  const stateClass = highlighted
    ? 'scale-110 drop-shadow-[0_0_10px_rgba(217,119,6,0.9)]'
    : dimmed
      ? 'opacity-45 saturate-50'
      : '';

  const boxClass = `${SYMBOL_BOX_CLASS[size]} flex items-center justify-center transition-all duration-200 ${stateClass}`;
  const svgClass = SVG_SIZE_CLASS[size];

  switch (symbol) {
    case 'SEVEN':
      return (
        <div className={boxClass}>
          <span
            className={`bg-gradient-to-b from-amber-300 via-rose-600 to-red-900 bg-clip-text font-black leading-none tracking-tighter text-transparent drop-shadow-[0_2px_4px_rgba(127,29,29,0.55)] ${SEVEN_TEXT_CLASS[size]}`}
          >
            7
          </span>
        </div>
      );

    case 'CHERRY':
      return (
        <div className={boxClass}>
          <svg
            viewBox="0 0 36 36"
            className={`${svgClass} drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]`}
          >
            <path
              d="M18 6 C14 11, 12 15, 11 20 M18 6 C22 11, 24 15, 25 20"
              fill="none"
              stroke="#15803d"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M18 6 C22 4, 26 5, 27 8 C23 9, 20 8, 18 6 Z"
              fill="#16a34a"
              stroke="#14532d"
              strokeWidth="0.8"
            />
            <circle cx="11" cy="24" r="6" fill="#e11d48" stroke="#881337" strokeWidth="1.2" />
            <circle cx="25" cy="24" r="6" fill="#be123c" stroke="#881337" strokeWidth="1.2" />
            <circle cx="9.2" cy="22" r="1.5" fill="#ffe4e6" />
            <circle cx="23.2" cy="22" r="1.5" fill="#ffe4e6" />
          </svg>
        </div>
      );

    case 'WATERMELON':
      return (
        <div className={boxClass}>
          <svg
            viewBox="0 0 36 36"
            className={`${svgClass} drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]`}
          >
            <path
              d="M4 13 A14 14 0 0 0 32 13 Z"
              fill="#15803d"
              stroke="#14532d"
              strokeWidth="1.5"
            />
            <path d="M7 13 A11 11 0 0 0 29 13 Z" fill="#dc2626" />
            <circle cx="13" cy="17" r="1.1" fill="#0f172a" />
            <circle cx="18" cy="19.5" r="1.1" fill="#0f172a" />
            <circle cx="23" cy="17" r="1.1" fill="#0f172a" />
          </svg>
        </div>
      );

    case 'BELL':
      return (
        <div className={boxClass}>
          <svg
            viewBox="0 0 36 36"
            className={`${svgClass} drop-shadow-[0_2px_3px_rgba(120,53,15,0.45)]`}
          >
            <path
              d="M18 5 C12 5, 10 11, 9 19 L6 25 L30 25 L27 19 C26 11, 24 5, 18 5 Z"
              fill="#facc15"
              stroke="#b45309"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle
              cx="18"
              cy="27.5"
              r="3"
              fill="#d97706"
              stroke="#78350f"
              strokeWidth="1.1"
            />
            <path
              d="M13 11 C13 14, 12.5 17, 12 20"
              stroke="#fef9c3"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      );

    case 'REPLAY':
      return (
        <div className={boxClass}>
          <div
            className={`flex items-center justify-center rounded-full border border-cyan-200 bg-gradient-to-b from-cyan-600 to-blue-800 shadow-[0_2px_6px_rgba(3,105,161,0.45)] ${PILL_CLASS[size].box}`}
          >
            <span
              className={`font-mono font-black text-white ${PILL_CLASS[size].text}`}
            >
              REPLAY
            </span>
          </div>
        </div>
      );

    case 'BAR':
      return (
        <div className={boxClass}>
          <div
            className={`flex items-center justify-center rounded border-2 border-slate-500 bg-gradient-to-b from-slate-800 via-slate-950 to-black shadow-[0_2px_6px_rgba(15,23,42,0.5)] ${BAR_CLASS[size].box}`}
          >
            <span
              className={`font-mono font-black text-white ${BAR_CLASS[size].text}`}
            >
              BAR
            </span>
          </div>
        </div>
      );

    case 'SKULL':
      return (
        <div className={boxClass}>
          <svg
            viewBox="0 0 36 36"
            className={`${svgClass} drop-shadow-[0_2px_4px_rgba(59,7,100,0.5)]`}
          >
            {/* 白系背景でも頭蓋骨を際立たせる濃い紫の背面オーラ */}
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="rgba(59,7,100,0.85)"
              stroke="#a855f7"
              strokeWidth="1.4"
            />
            {/* 頭蓋骨本体 */}
            <path
              d="M18 6 C11.5 6, 8 10.5, 8 16.5 C8 20.5, 10 23, 12 24.5 L12 29 L24 29 L24 24.5 C26 23, 28 20.5, 28 16.5 C28 10.5, 24.5 6, 18 6 Z"
              fill="#f1f5f9"
              stroke="#334155"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            {/* 真紅の眼窩 */}
            <circle cx="13.8" cy="17.2" r="2.7" fill="#dc2626" />
            <circle cx="22.2" cy="17.2" r="2.7" fill="#dc2626" />
            <circle cx="13.8" cy="17.2" r="1" fill="#fef08a" />
            <circle cx="22.2" cy="17.2" r="1" fill="#fef08a" />
            {/* 鼻・歯 */}
            <path d="M18 20 L16.7 22.8 L19.3 22.8 Z" fill="#0f172a" />
            <line x1="15" y1="25.5" x2="15" y2="29" stroke="#334155" strokeWidth="1.3" />
            <line x1="18" y1="25.5" x2="18" y2="29" stroke="#334155" strokeWidth="1.3" />
            <line x1="21" y1="25.5" x2="21" y2="29" stroke="#334155" strokeWidth="1.3" />
          </svg>
        </div>
      );
  }
}
