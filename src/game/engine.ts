import type {
  EffectStage,
  GameStats,
  Position,
  SettlementResult,
  Side,
  TradeOutcome,
} from './types.ts';

/** 進捗計算結果 */
export interface ProgressSnapshot {
  rawPnl: number;
  rawProgress: number;
  clampedProgress: number;
}

/** ティック評価結果 */
export interface TickEvaluation {
  updatedPosition: Position;
  snapshot: ProgressSnapshot;
  effectStage: EffectStage;
  settlement: SettlementResult | null;
}

/** ポジション生成（エントリー計算） */
export function createPosition(
  side: Side,
  entryPrice: number,
  targetWidth: number,
  isSakibare: boolean,
): Position {
  const tpPrice =
    side === 'LONG' ? entryPrice + targetWidth : entryPrice - targetWidth;
  const slPrice =
    side === 'LONG' ? entryPrice - targetWidth : entryPrice + targetWidth;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    side,
    entryPrice,
    targetWidth,
    tpPrice,
    slPrice,
    enteredAt: Date.now(),
    minProgressReached: 0,
    isSakibare,
  };
}

/**
 * 保有中ポジションの現在損益と進捗率（-100% 〜 +100%）を計算する
 */
export function calculateProgress(
  position: Pick<Position, 'side' | 'entryPrice' | 'targetWidth'>,
  currentPrice: number,
): ProgressSnapshot {
  const rawPnl =
    position.side === 'LONG'
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;

  const safeWidth = Math.max(0.0001, position.targetWidth);
  const rawProgress = (rawPnl / safeWidth) * 100;
  const clampedProgress = Math.max(-100, Math.min(100, rawProgress));

  return {
    rawPnl,
    rawProgress,
    clampedProgress,
  };
}

/**
 * 進捗率から現在の演出ステージを判定する
 * - -70% 以下: ピンチ
 * - +80% 以上: 激アツ
 * - +60% 以上: チャンス
 * - +30% 以上: 青オーラ
 */
export function determineEffectStage(progress: number): EffectStage {
  if (progress <= -70) return 'pinch';
  if (progress >= 80) return 'gekiatsu';
  if (progress >= 60) return 'chance';
  if (progress >= 30) return 'blue_aura';
  return 'neutral';
}

/**
 * ティックごとにポジションの勝敗判定と最小進捗率の更新を行う
 * - pricePath を渡した場合、前回通知以降の全約定価格を時系列順に評価し、
 *   スロットリングで間引かれた一瞬の TP / SL タッチも取りこぼさず先着側で決着させる
 */
export function evaluatePositionTick(
  position: Position,
  currentPrice: number,
  currentStats: GameStats,
  pricePath?: readonly number[],
): TickEvaluation {
  // 評価対象の価格列（最後は必ず現在価格で締める）
  const prices =
    pricePath && pricePath.length > 0
      ? pricePath[pricePath.length - 1] === currentPrice
        ? pricePath
        : [...pricePath, currentPrice]
      : [currentPrice];

  let workingPosition = position;
  let evaluation: TickEvaluation | null = null;
  for (const price of prices) {
    if (!Number.isFinite(price)) continue;
    evaluation = evaluateSinglePrice(workingPosition, price, currentStats);
    // 先に到達したライン（TP / SL）で即決着し、以降の価格は評価しない
    if (evaluation.settlement) return evaluation;
    workingPosition = evaluation.updatedPosition;
  }

  return evaluation ?? evaluateSinglePrice(position, currentPrice, currentStats);
}

/** 単一価格に対する勝敗判定と最小進捗率の更新 */
function evaluateSinglePrice(
  position: Position,
  currentPrice: number,
  currentStats: GameStats,
): TickEvaluation {
  const snapshot = calculateProgress(position, currentPrice);
  const nextMinProgress = Math.min(
    position.minProgressReached,
    snapshot.rawProgress,
  );
  const updatedPosition: Position = {
    ...position,
    minProgressReached: nextMinProgress,
  };

  if (snapshot.rawProgress >= 100) {
    // 同じポジション内で一度 -80% 以下まで追い込まれてから +100% 到達で逆転大当たり
    const wasComeback = nextMinProgress <= -80;
    const outcome: TradeOutcome = wasComeback ? 'COMEBACK_WIN' : 'WIN';
    const nextStats = applySettlementToStats(
      currentStats,
      outcome,
      position.targetWidth,
    );

    return {
      updatedPosition,
      snapshot: { ...snapshot, clampedProgress: 100 },
      effectStage: 'gekiatsu',
      settlement: {
        outcome,
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: position.tpPrice,
        pnl: position.targetWidth,
        targetWidth: position.targetWidth,
        streakAfter: nextStats.streak,
        wasComeback,
        previousStreak: currentStats.streak,
      },
    };
  }

  if (snapshot.rawProgress <= -100) {
    applySettlementToStats(currentStats, 'LOSE', position.targetWidth);
    return {
      updatedPosition,
      snapshot: { ...snapshot, clampedProgress: -100 },
      effectStage: 'pinch',
      settlement: {
        outcome: 'LOSE',
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: position.slPrice,
        pnl: -position.targetWidth,
        targetWidth: position.targetWidth,
        streakAfter: 0,
        wasComeback: false,
        previousStreak: currentStats.streak,
      },
    };
  }

  return {
    updatedPosition,
    snapshot,
    effectStage: determineEffectStage(snapshot.clampedProgress),
    settlement: null,
  };
}

/** エントリー発生時に取引開始回数を +1 して返す */
export function recordEntryToStats(stats: GameStats): GameStats {
  return {
    ...stats,
    totalEntries: stats.totalEntries + 1,
  };
}

/**
 * 決着結果を戦績オブジェクトへ反映する
 */
export function applySettlementToStats(
  stats: GameStats,
  outcome: TradeOutcome,
  targetWidth: number,
): GameStats {
  if (outcome === 'LOSE') {
    return {
      ...stats,
      losses: stats.losses + 1,
      streak: 0,
      totalPnl: stats.totalPnl - targetWidth,
      settledTrades: stats.settledTrades + 1,
    };
  }

  const nextStreak = stats.streak + 1;
  return {
    ...stats,
    wins: stats.wins + 1,
    losses: stats.losses,
    streak: nextStreak,
    maxStreak: Math.max(stats.maxStreak, nextStreak),
    totalPnl: stats.totalPnl + targetWidth,
    comebackWins:
      outcome === 'COMEBACK_WIN' ? stats.comebackWins + 1 : stats.comebackWins,
    settledTrades: stats.settledTrades + 1,
  };
}

/** 2連勝以上で連勝中判定 */
export function isWinningStreak(stats: Pick<GameStats, 'streak'>): boolean {
  return stats.streak >= 2;
}

/** 勝率（%）を計算 */
export function getWinRate(stats: Pick<GameStats, 'wins' | 'losses'>): number {
  const total = stats.wins + stats.losses;
  if (total === 0) return 0;
  return (stats.wins / total) * 100;
}

/** 未決着（途中離脱）数を計算 */
export function getUnsettledCount(
  stats: Pick<GameStats, 'totalEntries' | 'settledTrades'>,
): number {
  return Math.max(0, stats.totalEntries - stats.settledTrades);
}

/** 取引成立率（%）を計算（0戦時は 0 を返す） */
export function getCompletionRate(
  stats: Pick<GameStats, 'totalEntries' | 'settledTrades'>,
): number {
  if (stats.totalEntries <= 0) return 0;
  const rate = (stats.settledTrades / stats.totalEntries) * 100;
  return Math.min(100, Math.max(0, rate));
}
