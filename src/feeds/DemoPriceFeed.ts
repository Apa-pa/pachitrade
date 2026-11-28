import {
  mergeTickIntoCandle,
  type Candle,
  type InstrumentMeta,
  type PriceFeed,
  type PriceFeedCallbacks,
  type PriceTick,
} from './PriceFeed.ts';

const INITIAL_CANDLE_COUNT = 80;
const BASE_PRICE = 90000;
const TICK_INTERVAL_MS = 250;

/** Box-Muller 法による標準正規乱数（平均0, 標準偏差1） */
function randomGaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * 演出テスト・高速プレイ用の疑似ランダムウォーク価格フィード
 * サーバー通信なしで動作し、250msごとに価格を更新する
 */
export class DemoPriceFeed implements PriceFeed {
  readonly mode = 'demo' as const;
  readonly meta: InstrumentMeta = {
    symbol: 'DEMO-BTC/USDT',
    unit: 'USDT',
    decimals: 2,
    defaultTargetWidth: 30,
    presetWidths: [20, 30, 50, 100],
    candleIntervalSec: 5,
  };

  private timerId: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private currentCandle: Candle | null = null;
  private lastPrice = BASE_PRICE;
  /** トレンドと逆転演出を生む緩やかなモメンタム成分 */
  private momentum = 0;

  /**
   * 現在時刻までの過去80本（5秒足）の疑似ローソク足を生成する
   */
  async getInitialCandles(): Promise<Candle[]> {
    const interval = this.meta.candleIntervalSec;
    const nowSec = Math.floor(Date.now() / 1000);
    const latestBucket = Math.floor(nowSec / interval) * interval;
    const candles: Candle[] = [];

    let price = BASE_PRICE + (Math.random() - 0.5) * 300;
    this.momentum = (Math.random() - 0.5) * 4;

    for (let i = INITIAL_CANDLE_COUNT - 1; i >= 0; i--) {
      const time = latestBucket - i * interval;
      const open = price;
      let high = open;
      let low = open;
      let close = open;

      // 1本の5秒足内で数ティック分の変動をシミュレートして自然なヒゲを作る
      for (let step = 0; step < 5; step++) {
        price = this.computeNextPrice(price);
        high = Math.max(high, price);
        low = Math.min(low, price);
        close = price;
      }

      candles.push({
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
      });
    }

    this.lastPrice = price;
    this.currentCandle = candles[candles.length - 1] ?? null;
    return candles;
  }

  start(callbacks: PriceFeedCallbacks): void {
    this.disposed = false;
    this.clearTimer();

    callbacks.onStatusChange(
      'connected',
      'DEMO 疑似相場稼動中（250ms 高速生成）',
    );

    // 開始直後に現在価格を即時通知
    const initialTick: PriceTick = {
      price: Number(this.lastPrice.toFixed(2)),
      timestamp: Date.now(),
    };
    callbacks.onTick(initialTick);

    this.timerId = setInterval(() => {
      if (this.disposed) return;

      const nextPrice = Number(
        this.computeNextPrice(this.lastPrice).toFixed(2),
      );
      this.lastPrice = nextPrice;

      const tick: PriceTick = {
        price: nextPrice,
        timestamp: Date.now(),
      };

      this.currentCandle = mergeTickIntoCandle(
        this.currentCandle,
        tick,
        this.meta.candleIntervalSec,
      );

      callbacks.onTick(tick);
      callbacks.onCandleUpdate(this.currentCandle);
    }, TICK_INTERVAL_MS);
  }

  /**
   * ランダムウォーク + 反転モメンタム + 時々のスパイクにより
   * 1勝負が数十秒で決着し、逆転劇も起きやすい価格推移を生成する
   */
  private computeNextPrice(current: number): number {
    // 緩やかに平均回帰しつつ波を作るモメンタム更新
    this.momentum = this.momentum * 0.88 + randomGaussian() * 1.4;
    if (Math.random() < 0.04) {
      // まれにトレンド方向を急反転させ、ピンチからの逆転を起こしやすくする
      this.momentum = -this.momentum * 1.15;
    }
    this.momentum = Math.max(-6, Math.min(6, this.momentum));

    const noise = randomGaussian() * 4.5;
    let spike = 0;
    if (Math.random() < 0.03) {
      const magnitude = 12 + Math.random() * 8;
      spike = (Math.random() < 0.5 ? -1 : 1) * magnitude;
    }

    const next = current + this.momentum + noise + spike;
    // 異常値へ発散しないよう基準付近へ緩やかに引き戻す
    if (next < 1000) return 1000;
    return next;
  }

  private clearTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  stop(): void {
    this.disposed = true;
    this.clearTimer();
  }
}
