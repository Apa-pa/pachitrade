import bellImg from '../../asset/02_bell.webp';
import cherriesImg from '../../asset/04_cherries.webp';
import pachiTradeSignImg from '../../asset/05_pachi_trade_sign.webp';
import recycleImg from '../../asset/06_recycle.webp';
import sevenImg from '../../asset/01_seven.webp';
import skullImg from '../../asset/07_skull.webp';
import watermelonImg from '../../asset/03_watermelon.webp';
import type { SlotSymbol } from '../game/slotEngine.ts';

export type SlotSymbolSize = 'sm' | 'md' | 'lg';

interface SlotSymbolArtProps {
  symbol: SlotSymbol;
  highlighted?: boolean;
  dimmed?: boolean;
  size?: SlotSymbolSize;
}

interface SymbolAssetMeta {
  src: string;
  alt: string;
}

/**
 * 図柄コンテナのサイズ別ボックス（PC・モバイルの各リールセル高さに収まるサイズ）
 */
const SYMBOL_BOX_CLASS: Record<SlotSymbolSize, string> = {
  sm: 'h-6 w-8',
  md: 'h-10 w-14',
  lg: 'h-[84%] w-[88%] max-h-[82px] max-w-[104px]',
};

/**
 * 各スロット図柄に対応する WebP 画像とメタ定義
 */
const SYMBOL_IMAGE_MAP: Record<SlotSymbol, SymbolAssetMeta> = {
  SEVEN: {
    src: sevenImg,
    alt: '赤7',
  },
  BELL: {
    src: bellImg,
    alt: 'ベル',
  },
  WATERMELON: {
    src: watermelonImg,
    alt: 'スイカ',
  },
  CHERRY: {
    src: cherriesImg,
    alt: 'チェリー',
  },
  BAR: {
    src: pachiTradeSignImg,
    alt: 'PACHI TRADE BAR',
  },
  REPLAY: {
    src: recycleImg,
    alt: 'リプレイ',
  },
  SKULL: {
    src: skullImg,
    alt: 'ドクロ',
  },
};

let hasPreloadedSymbols = false;

/**
 * 停止切り替え時の描画欠けを防ぐため、ブラウザ環境で全図柄を事前デコードする
 */
function preloadSlotSymbols(): void {
  if (hasPreloadedSymbols || typeof Image === 'undefined') return;
  hasPreloadedSymbols = true;
  for (const meta of Object.values(SYMBOL_IMAGE_MAP)) {
    const img = new Image();
    img.decoding = 'sync';
    img.src = meta.src;
    img.decode?.().catch(() => {});
  }
}

preloadSlotSymbols();

/**
 * スロットリール用の図柄グラフィック（WebP画像）
 */
export function SlotSymbolArt({
  symbol,
  highlighted = false,
  dimmed = false,
  size = 'md',
}: SlotSymbolArtProps) {
  preloadSlotSymbols();

  // iOS WebKit の GPU レイヤー消失を防ぐため CSS filter（saturate / drop-shadow）は使用しない
  const stateClass = highlighted
    ? 'slot-symbol-highlighted'
    : dimmed
      ? 'opacity-40'
      : '';

  const boxClass = `relative ${SYMBOL_BOX_CLASS[size]} flex items-center justify-center origin-center transition-[transform,opacity] duration-150 ease-out ${stateClass}`;
  const asset = SYMBOL_IMAGE_MAP[symbol];

  return (
    <div className={boxClass}>
      {highlighted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.48)_0%,rgba(217,119,6,0.18)_55%,transparent_75%)]"
        />
      )}
      <img
        src={asset.src}
        alt={asset.alt}
        draggable={false}
        loading="eager"
        decoding="sync"
        className="relative z-10 h-full w-full max-h-full max-w-full select-none object-contain"
      />
    </div>
  );
}
