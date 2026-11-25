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
}
