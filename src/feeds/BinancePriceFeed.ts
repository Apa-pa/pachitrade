import {
  mergeTickIntoCandle,
  type Candle,
  type InstrumentMeta,
  type PriceFeed,
  type PriceFeedCallbacks,
  type PriceTick,
} from './PriceFeed.ts';

const REST_ENDPOINTS = [
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120',
  'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120',
] as const;

const WS_ENDPOINTS = [
  'wss://stream.binance.com:9443/ws/btcusdt@trade',
  'wss://data-stream.binance.vision/ws/btcusdt@trade',
] as const;

/** 自動再接続の待機時間（ミリ秒）と最大試行回数 */
const RECONNECT_DELAYS_MS = [1500, 3000, 5000, 8000, 12000] as const;
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;
const REST_TIMEOUT_MS = 6000;
const EMIT_THROTTLE_MS = 80;

/** Binance klines レスポンス要素（配列形式） */
type BinanceKlineRow = [
  number, // 0: 開始時刻 (ms)
  string, // 1: 始値
  string, // 2: 高値
  string, // 3: 安値
  string, // 4: 終値
  ...unknown[],
];

/** Binance trade ストリームの必要フィールド */
interface BinanceTradePayload {
  p?: string; // 約定価格
  T?: number; // 約定時刻 (ms)
  E?: number; // イベント時刻 (ms)
}

/**
 * Binance 公開 API を使った BTC/USDT リアルタイム価格フィード
 */
export class BinancePriceFeed implements PriceFeed {
  readonly mode = 'realtime' as const;
  readonly meta: InstrumentMeta = {
    symbol: 'BTC/USDT',
    unit: 'USDT',
    decimals: 2,
    defaultTargetWidth: 30,
    presetWidths: [20, 30, 50, 100],
    candleIntervalSec: 60,
  };

  private ws: WebSocket | null = null;
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private reconnectAttempts = 0;
  private currentCandle: Candle | null = null;
  private callbacks: PriceFeedCallbacks | null = null;
  private lastEmitAt = 0;
  private pendingTick: PriceTick | null = null;
  /** 前回通知以降の全約定価格（時系列順） */
  private pendingPath: number[] = [];

  /**
   * Binance REST API から直近の1分足ローソク足を取得する
   * 本番APIに失敗した場合は公式データミラーへフォールバックする
   */
  async getInitialCandles(): Promise<Candle[]> {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    let lastError: unknown = null;

    for (const url of REST_ENDPOINTS) {
      if (this.disposed || controller.signal.aborted) {
        return [];
      }

      const timeoutId = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const rawRows = (await response.json()) as BinanceKlineRow[];
        const parsed = this.normalizeCandles(rawRows);
        if (parsed.length > 0) {
          this.currentCandle = parsed[parsed.length - 1];
        }
        return parsed;
      } catch (err) {
        lastError = err;
        // 中断エラーが明示的な stop() によるものなら即座に終了する
        if (this.disposed) {
          return [];
        }
        // タイムアウトで abort された場合は次のエンドポイント用に新しい AbortController を生成
        if (controller.signal.aborted && !this.disposed) {
          const nextController = new AbortController();
          this.abortController = nextController;
          clearTimeout(timeoutId);
          return this.fetchFromFallback(url, nextController);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Binanceの初期ローソク足取得に失敗しました');
  }

  private async fetchFromFallback(
    failedUrl: string,
    controller: AbortController,
  ): Promise<Candle[]> {
    const remaining = REST_ENDPOINTS.filter((u) => u !== failedUrl);
    for (const url of remaining) {
      if (this.disposed) return [];
      const timeoutId = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const rawRows = (await response.json()) as BinanceKlineRow[];
        const parsed = this.normalizeCandles(rawRows);
        if (parsed.length > 0) {
          this.currentCandle = parsed[parsed.length - 1];
        }
        return parsed;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error('Binance REST API に接続できませんでした');
  }

  private normalizeCandles(rows: BinanceKlineRow[]): Candle[] {
    const byTime = new Map<number, Candle>();
    for (const row of rows) {
      const time = Math.floor(Number(row[0]) / 1000);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      if (
        Number.isFinite(time) &&
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close)
      ) {
        byTime.set(time, { time, open, high, low, close });
      }
    }
    return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
  }

  start(callbacks: PriceFeedCallbacks): void {
    this.disposed = false;
    this.callbacks = callbacks;
    this.reconnectAttempts = 0;
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.disposed || !this.callbacks) return;

    this.clearReconnectTimer();
    const endpoint = WS_ENDPOINTS[this.reconnectAttempts % WS_ENDPOINTS.length];
    const isRetry = this.reconnectAttempts > 0;

    this.callbacks.onStatusChange(
      isRetry ? 'reconnecting' : 'connecting',
      isRetry
        ? `Binance WebSocket に再接続中... (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
        : 'Binance WebSocket に接続中...',
    );

    let socket: WebSocket;
    try {
      socket = new WebSocket(endpoint);
    } catch {
      this.scheduleReconnect('WebSocket の初期化に失敗しました');
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      if (this.disposed || this.ws !== socket) return;
      this.reconnectAttempts = 0;
      this.callbacks?.onStatusChange('connected', 'Binance LIVE 接続中');
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.disposed || this.ws !== socket) return;
      try {
        const payload = JSON.parse(event.data) as BinanceTradePayload;
        const price = Number(payload.p);
        const timestamp = Number(payload.T ?? payload.E ?? Date.now());
        if (!Number.isFinite(price) || price <= 0) return;

        const tick: PriceTick = { price, timestamp };
        // ローソク足の高値・安値を正確に残すため、内部集計は全ティックで即座に実行
        this.currentCandle = mergeTickIntoCandle(
          this.currentCandle,
          tick,
          this.meta.candleIntervalSec,
        );
        // 間引かれるティックでも TP / SL タッチを判定できるよう全約定価格を蓄積
        this.pendingPath.push(price);
        this.emitThrottled(tick);
      } catch {
        // パース不能なメッセージは無視
      }
    };

    socket.onerror = () => {
      // close イベント側で再接続制御を行うためここでは破棄フラグのみ確認
    };

    socket.onclose = () => {
      if (this.disposed || this.ws !== socket) return;
      this.ws = null;
      this.scheduleReconnect('Binance WebSocket との接続が切断されました');
    };
  }

  /**
   * UI 描画負荷を抑えるため ~80ms 間隔で通知しつつ、最後のティックも取りこぼさない
   */
  private emitThrottled(tick: PriceTick): void {
    if (!this.callbacks || !this.currentCandle) return;

    const now = performance.now();
    const elapsed = now - this.lastEmitAt;

    if (elapsed >= EMIT_THROTTLE_MS) {
      this.lastEmitAt = now;
      this.pendingTick = null;
      if (this.throttleTimer) {
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
      }
      this.callbacks.onTick(this.attachPricePath(tick));
      this.callbacks.onCandleUpdate(this.currentCandle);
      return;
    }

    this.pendingTick = tick;
    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        if (this.disposed || !this.pendingTick || !this.currentCandle || !this.callbacks) {
          return;
        }
        const latestTick = this.pendingTick;
        this.pendingTick = null;
        this.lastEmitAt = performance.now();
        this.callbacks.onTick(this.attachPricePath(latestTick));
        this.callbacks.onCandleUpdate(this.currentCandle);
      }, EMIT_THROTTLE_MS - elapsed);
    }
  }

  /** 蓄積した約定価格列をティックへ添付し、蓄積バッファをリセットする */
  private attachPricePath(tick: PriceTick): PriceTick {
    const path = this.pendingPath;
    this.pendingPath = [];
    return path.length > 1 ? { ...tick, pricePath: path } : tick;
  }

  private scheduleReconnect(reason: string): void {
    if (this.disposed || !this.callbacks) return;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks.onStatusChange(
        'error',
        `${reason}。自動再接続の上限に達しました。DEMOモードへの切り替えをお試しください。`,
      );
      return;
    }

    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.reconnectAttempts += 1;

    this.callbacks.onStatusChange(
      'reconnecting',
      `${reason}。${(delay / 1000).toFixed(1)}秒後に再接続します (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    );

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  stop(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingTick = null;
    this.pendingPath = [];

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        try {
          socket.close();
        } catch {
          // 既に閉じている場合の例外を無視
        }
      }
    }

    this.callbacks = null;
  }
}
