import type { SlotSymbol } from '../game/slotEngine.ts';

interface SlotSymbolArtProps {
  symbol: SlotSymbol;
  highlighted?: boolean;
  dimmed?: boolean;
}

/**
 * スロットリール用の図柄グラフィック（SVG＋ネオンタイポグラフィ）
 */
export function SlotSymbolArt({
  symbol,
  highlighted = false,
  dimmed = false,
}: SlotSymbolArtProps) {
  const stateClass = highlighted
    ? 'scale-105 drop-shadow-[0_0_8px_rgba(250,204,21,0.75)]'
    : dimmed
      ? 'opacity-70'
      : '';

  switch (symbol) {
    case 'SEVEN':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <span className="bg-gradient-to-b from-yellow-200 via-rose-500 to-red-700 bg-clip-text font-black text-3xl leading-none tracking-tighter text-transparent drop-shadow-[0_0_10px_rgba(244,63,94,0.85)] [-webkit-text-stroke:1px_#fde047]">
            7
          </span>
        </div>
      );

    case 'CHERRY':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <svg viewBox="0 0 36 36" className="h-8 w-8 drop-shadow-[0_0_6px_rgba(244,63,94,0.65)]">
            <path
              d="M18 6 C14 11, 12 15, 11 20 M18 6 C22 11, 24 15, 25 20"
              fill="none"
              stroke="#4ade80"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M18 6 C22 4, 26 5, 27 8 C23 9, 20 8, 18 6 Z"
              fill="#22c55e"
            />
            <circle cx="11" cy="24" r="6" fill="#f43f5e" stroke="#fda4af" strokeWidth="1.2" />
            <circle cx="25" cy="24" r="6" fill="#e11d48" stroke="#fda4af" strokeWidth="1.2" />
            <circle cx="9.2" cy="22" r="1.4" fill="#ffe4e6" />
            <circle cx="23.2" cy="22" r="1.4" fill="#ffe4e6" />
          </svg>
        </div>
      );

    case 'WATERMELON':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <svg viewBox="0 0 36 36" className="h-8 w-8 drop-shadow-[0_0_6px_rgba(34,197,94,0.65)]">
            <path
              d="M4 13 A14 14 0 0 0 32 13 Z"
              fill="#16a34a"
              stroke="#86efac"
              strokeWidth="1.5"
            />
            <path d="M7 13 A11 11 0 0 0 29 13 Z" fill="#ef4444" />
            <circle cx="13" cy="17" r="1" fill="#0f172a" />
            <circle cx="18" cy="19.5" r="1" fill="#0f172a" />
            <circle cx="23" cy="17" r="1" fill="#0f172a" />
          </svg>
        </div>
      );

    case 'BELL':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <svg viewBox="0 0 36 36" className="h-8 w-8 drop-shadow-[0_0_6px_rgba(250,204,21,0.65)]">
            <path
              d="M18 5 C12 5, 10 11, 9 19 L6 25 L30 25 L27 19 C26 11, 24 5, 18 5 Z"
              fill="#facc15"
              stroke="#fef08a"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="18" cy="27.5" r="3" fill="#eab308" stroke="#fef08a" strokeWidth="1" />
            <path d="M13 11 C13 14, 12.5 17, 12 20" stroke="#fef9c3" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      );

    case 'REPLAY':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <div className="flex h-7 w-14 items-center justify-center rounded-full border border-cyan-300/90 bg-gradient-to-b from-cyan-400/35 to-blue-700/60 shadow-[0_0_10px_rgba(34,211,238,0.45)]">
            <span className="font-mono text-[11px] font-black tracking-wider text-cyan-200">
              REPLAY
            </span>
          </div>
        </div>
      );

    case 'BAR':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <div className="flex h-7 w-14 items-center justify-center rounded border-2 border-slate-300/80 bg-gradient-to-b from-slate-700 via-slate-900 to-black shadow-[0_0_8px_rgba(148,163,184,0.35)]">
            <span className="font-mono text-xs font-black tracking-widest text-white">
              BAR
            </span>
          </div>
        </div>
      );

    case 'SKULL':
      return (
        <div className={`flex flex-col items-center justify-center transition-all duration-200 ${stateClass}`}>
          <svg viewBox="0 0 36 36" className="h-8 w-8 drop-shadow-[0_0_9px_rgba(168,85,247,0.85)]">
            {/* 紫黒の怪しい背面オーラ */}
            <circle cx="18" cy="18" r="15" fill="rgba(88,28,135,0.45)" stroke="#c084fc" strokeWidth="1.2" />
            {/* 頭蓋骨本体 */}
            <path
              d="M18 6 C11.5 6, 8 10.5, 8 16.5 C8 20.5, 10 23, 12 24.5 L12 29 L24 29 L24 24.5 C26 23, 28 20.5, 28 16.5 C28 10.5, 24.5 6, 18 6 Z"
              fill="#e2e8f0"
              stroke="#475569"
              strokeWidth="1.2"
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
