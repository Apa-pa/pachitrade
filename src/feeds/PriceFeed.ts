import type { Candle, PriceTick } from '../types/market.ts';

export type {
  Candle,
  FeedMode,
  FeedStatus,
  InstrumentMeta,
  PriceFeed,
  PriceFeedCallbacks,
  PriceTick,
} from '../types/market.ts';

/**
 * 受信したティックを現在のローソク足へ集約する。
 * lightweight-charts は過去時刻の update() で例外を送出するため、
 * 順不同ティックで bucketTime が現在足より過去になっても時刻を巻き戻さない。
 */
export function mergeTickIntoCandle(
  current: Candle | null,
  tick: PriceTick,
  intervalSec: number,
): Candle {
  const safeInterval = Math.max(1, intervalSec);
  const bucketTime = Math.floor(tick.timestamp / 1000 / safeInterval) * safeInterval;

  if (!current) {
    return {
      time: bucketTime,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
    };
  }

  // 順不同の遅延ティックでも現在足より前の時刻には戻さない
  if (bucketTime <= current.time) {
    return {
      time: current.time,
      open: current.open,
      high: Math.max(current.high, tick.price),
      low: Math.min(current.low, tick.price),
      close: tick.price,
    };
  }

  // 新しい時間枠のローソク足を生成
  return {
    time: bucketTime,
    open: tick.price,
    high: tick.price,
    low: tick.price,
    close: tick.price,
  };
}
