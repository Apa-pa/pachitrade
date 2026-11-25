import { BinancePriceFeed } from './BinancePriceFeed.ts';
import { DemoPriceFeed } from './DemoPriceFeed.ts';
import type { FeedMode, PriceFeed } from './PriceFeed.ts';

export { BinancePriceFeed } from './BinancePriceFeed.ts';
export { DemoPriceFeed } from './DemoPriceFeed.ts';
export * from './PriceFeed.ts';

/**
 * モードに応じた PriceFeed インスタンスを生成するファクトリ関数
 * 将来的に日本株（例: Nikkei225Feed）や指数データソースを追加する場合は、
 * PriceFeed インターフェースを実装したクラスを追加してここで分岐させる。
 */
export function createPriceFeed(mode: FeedMode): PriceFeed {
  switch (mode) {
    case 'realtime':
      return new BinancePriceFeed();
    case 'demo':
      return new DemoPriceFeed();
  }
}
