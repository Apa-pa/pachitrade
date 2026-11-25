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
 */
export function evaluatePositionTick(
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
    };
  }

  const nextStreak = stats.streak + 1;
  return {
    wins: stats.wins + 1,
    losses: stats.losses,
    streak: nextStreak,
    maxStreak: Math.max(stats.maxStreak, nextStreak),
    totalPnl: stats.totalPnl + targetWidth,
    comebackWins:
      outcome === 'COMEBACK_WIN' ? stats.comebackWins + 1 : stats.comebackWins,
  };
}

/** 2連勝以上で「確変中（RUSH）」判定 */
export function isRushActive(stats: Pick<GameStats, 'streak'>): boolean {
  return stats.streak >= 2;
}

/** 勝率（%）を計算 */
export function getWinRate(stats: Pick<GameStats, 'wins' | 'losses'>): number {
  const total = stats.wins + stats.losses;
  if (total === 0) return 0;
  return (stats.wins / total) * 100;
}
