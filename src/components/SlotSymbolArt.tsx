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
  shadowClass: string;
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
 * 各スロット図柄に対応する WebP 画像とスタイル定義
 */
const SYMBOL_IMAGE_MAP: Record<SlotSymbol, SymbolAssetMeta> = {
  SEVEN: {
    src: sevenImg,
    alt: '赤7',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  BELL: {
    src: bellImg,
    alt: 'ベル',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  WATERMELON: {
    src: watermelonImg,
    alt: 'スイカ',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  CHERRY: {
    src: cherriesImg,
    alt: 'チェリー',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  BAR: {
    src: pachiTradeSignImg,
    alt: 'PACHI TRADE BAR',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  REPLAY: {
    src: recycleImg,
    alt: 'リプレイ',
    shadowClass: 'drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]',
  },
  SKULL: {
    src: skullImg,
    alt: 'ドクロ',
    // 白系リール背景上でも輪郭が際立つように濃い紫の影を付与
    shadowClass: 'drop-shadow-[0_2px_4px_rgba(59,7,100,0.55)]',
  },
};

/**
 * スロットリール用の図柄グラフィック（WebP画像）
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
  const asset = SYMBOL_IMAGE_MAP[symbol];

  return (
    <div className={boxClass}>
      <img
        src={asset.src}
        alt={asset.alt}
        draggable={false}
        decoding="async"
        className={`h-full w-full select-none object-contain ${asset.shadowClass}`}
      />
    </div>
  );
}
