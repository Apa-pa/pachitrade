/** 価格フィードの動作モード */
export type FeedMode = 'realtime' | 'demo';

/** 価格フィードの接続状態 */
export type FeedStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** ローソク足データ（time は UNIX 秒） */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** リアルタイム価格ティック（timestamp は UNIX ミリ秒） */
export interface PriceTick {
  price: number;
  timestamp: number;
  /**
   * 前回通知以降に発生した全約定価格（時系列順、最後は price と同値）
   * スロットリングで間引かれたティックの TP / SL タッチ判定に使用する（省略時は price のみ）
   */
  pricePath?: number[];
}

/** 銘柄・市場ごとのメタ情報（日本株や指数への差し替え時にここを拡張） */
export interface InstrumentMeta {
  /** 表示用の銘柄名 */
  symbol: string;
  /** 価格・値幅の単位（例: USDT, 円, pt） */
  unit: string;
  /** 小数点以下の表示桁数 */
  decimals: number;
  /** デフォルトの利確・損切り目標幅 */
  defaultTargetWidth: number;
  /** 目標幅のプリセット候補 */
  presetWidths: number[];
  /** ローソク足1本あたりの秒数 */
  candleIntervalSec: number;
}

/** 価格フィードからUI/ゲーム層へ通知するコールバック群 */
export interface PriceFeedCallbacks {
  onTick: (tick: PriceTick) => void;
  onCandleUpdate: (candle: Candle) => void;
  onStatusChange: (status: FeedStatus, message?: string) => void;
}

/**
 * 差し替え可能な価格データ取得インターフェース
 * 暗号資産（Binance）、日本株、日経平均等のアダプタはすべてこのインターフェースを実装する。
 */
export interface PriceFeed {
  readonly mode: FeedMode;
  readonly meta: InstrumentMeta;
  /** 初期チャート描画用の履歴ローソク足を返す */
  getInitialCandles(): Promise<Candle[]>;
  /** リアルタイム価格配信を開始する */
  start(callbacks: PriceFeedCallbacks): void;
  /** 配信を停止しリソースを解放する */
  stop(): void;
}
