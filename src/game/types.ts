/** トレード方向 */
export type Side = 'LONG' | 'SHORT';

/** 保有中ポジション情報 */
export interface Position {
  id: string;
  side: Side;
  entryPrice: number;
  targetWidth: number;
  tpPrice: number;
  slPrice: number;
  enteredAt: number;
  /** 同ポジション内で一度でも到達した最小進捗率（逆転大当たり判定用） */
  minProgressReached: number;
  /** エントリー時に先バレ演出が発生したか */
  isSakibare: boolean;
}

/** 進捗に応じた演出ステージ */
export type EffectStage =
  | 'neutral'
  | 'blue_aura'
  | 'chance'
  | 'gekiatsu'
  | 'pinch';

/** 決着種別 */
export type TradeOutcome = 'WIN' | 'COMEBACK_WIN' | 'LOSE';

/** 決着結果サマリー */
export interface SettlementResult {
  outcome: TradeOutcome;
  side: Side;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  targetWidth: number;
  streakAfter: number;
  wasComeback: boolean;
  previousStreak: number;
}

/** 永続化される通算戦績 */
export interface GameStats {
  wins: number;
  losses: number;
  streak: number;
  maxStreak: number;
  totalPnl: number;
  comebackWins: number;
  /** 取引開始回数（LONG / SHORT エントリー時に +1） */
  totalEntries: number;
  /** 決着回数（TP / SL 到達時に +1） */
  settledTrades: number;
}

/** 1トレード分の決着履歴レコード（localStorage保存用コンパクト形式） */
export interface TradeRecord {
  /** 決着時刻（Unixミリ秒） */
  t: number;
  /** 勝敗（'W' = 勝ち, 'L' = 負け） */
  o: 'W' | 'L';
  /** 確定損益 */
  p: number;
  /** 方向（'L' = LONG, 'S' = SHORT） */
  s: 'L' | 'S';
}

/** 戦績画面の集計フィルタ種別 */
export type StatsFilter =
  | { kind: 'today' }
  | { kind: 'recent'; count: number }
  | { kind: 'all' };

/** フィルタ適用後の集計戦績サマリー */
export interface StatsPeriodSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  maxWinStreak: number;
  maxLoseStreak: number;
}

/** 戦績画面で永続化するユーザー設定（プレイヤー名・履歴保存上限） */
export interface StatsProfile {
  playerName: string;
  maxHistoryCount: number;
}
