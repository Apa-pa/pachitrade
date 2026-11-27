import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySettlementToStats,
  calculateProgress,
  createPosition,
  determineEffectStage,
  evaluatePositionTick,
  getCompletionRate,
  getUnsettledCount,
  isWinningStreak,
  recordEntryToStats,
} from './engine.ts';
import { normalizeStats } from './storage.ts';
import type { GameStats } from './types.ts';

const baseStats: GameStats = {
  wins: 0,
  losses: 0,
  streak: 0,
  maxStreak: 0,
  totalPnl: 0,
  comebackWins: 0,
  totalEntries: 0,
  settledTrades: 0,
};

test('LONG と SHORT の進捗率と損益計算が正しい', () => {
  const longPos = createPosition('LONG', 90000, 100, false);
  const longUp = calculateProgress(longPos, 90060);
  assert.equal(longUp.rawPnl, 60);
  assert.equal(longUp.clampedProgress, 60);

  const shortPos = createPosition('SHORT', 90000, 100, false);
  const shortDown = calculateProgress(shortPos, 89920);
  assert.equal(shortDown.rawPnl, 80);
  assert.equal(shortDown.clampedProgress, 80);

  const shortUp = calculateProgress(shortPos, 90150);
  assert.equal(shortUp.rawPnl, -150);
  assert.equal(shortUp.clampedProgress, -100);
});

test('演出ステージの閾値（+30 / +60 / +80 / -70）が正しく判定される', () => {
  assert.equal(determineEffectStage(0), 'neutral');
  assert.equal(determineEffectStage(29.9), 'neutral');
  assert.equal(determineEffectStage(30), 'blue_aura');
  assert.equal(determineEffectStage(59.9), 'blue_aura');
  assert.equal(determineEffectStage(60), 'chance');
  assert.equal(determineEffectStage(79.9), 'chance');
  assert.equal(determineEffectStage(80), 'gekiatsu');
  assert.equal(determineEffectStage(-69.9), 'neutral');
  assert.equal(determineEffectStage(-70), 'pinch');
  assert.equal(determineEffectStage(-99), 'pinch');
});

test('通常WIN と 逆転大当たり（-80%以下からの+100%到達）を区別できる', () => {
  // 通常WIN
  let pos1 = createPosition('LONG', 90000, 50, false);
  const eval1a = evaluatePositionTick(pos1, 89970, baseStats); // -60%
  assert.equal(eval1a.settlement, null);
  pos1 = eval1a.updatedPosition;
  const eval1b = evaluatePositionTick(pos1, 90050, baseStats); // +100%
  assert.equal(eval1b.settlement?.outcome, 'WIN');
  assert.equal(eval1b.settlement?.wasComeback, false);

  // 逆転大当たり（一度 -80% 以下へ下落してから利確）
  let pos2 = createPosition('LONG', 90000, 50, false);
  const eval2a = evaluatePositionTick(pos2, 89960, baseStats); // -80%
  assert.equal(eval2a.settlement, null);
  assert.equal(eval2a.updatedPosition.minProgressReached, -80);
  pos2 = eval2a.updatedPosition;
  const eval2b = evaluatePositionTick(pos2, 90050, baseStats); // +100%
  assert.equal(eval2b.settlement?.outcome, 'COMEBACK_WIN');
  assert.equal(eval2b.settlement?.wasComeback, true);
  assert.equal(eval2b.settlement?.pnl, 50);
});

test('LOSE 判定と連勝数の戦績更新が正しい', () => {
  const pos = createPosition('SHORT', 90000, 50, false);
  const loseEval = evaluatePositionTick(pos, 90055, baseStats);
  assert.equal(loseEval.settlement?.outcome, 'LOSE');
  assert.equal(loseEval.settlement?.pnl, -50);

  let stats = applySettlementToStats(baseStats, 'WIN', 50);
  assert.equal(stats.streak, 1);
  assert.equal(isWinningStreak(stats), false);

  stats = applySettlementToStats(stats, 'COMEBACK_WIN', 50);
  assert.equal(stats.streak, 2);
  assert.equal(stats.comebackWins, 1);
  assert.equal(stats.totalPnl, 100);
  assert.equal(isWinningStreak(stats), true);

  stats = applySettlementToStats(stats, 'LOSE', 50);
  assert.equal(stats.streak, 0);
  assert.equal(stats.maxStreak, 2);
  assert.equal(stats.totalPnl, 50);
  assert.equal(isWinningStreak(stats), false);
});

test('recordEntryToStats と applySettlementToStats で取引成立率・未決着数が正しく計算される', () => {
  assert.equal(getCompletionRate(baseStats), 0);
  assert.equal(getUnsettledCount(baseStats), 0);

  let stats = { ...baseStats };
  // 20回エントリーして19回決着（15勝・4敗・1途中離脱）を再現
  for (let i = 0; i < 20; i++) {
    stats = recordEntryToStats(stats);
  }
  for (let i = 0; i < 15; i++) {
    stats = applySettlementToStats(stats, 'WIN', 50);
  }
  for (let i = 0; i < 4; i++) {
    stats = applySettlementToStats(stats, 'LOSE', 50);
  }

  assert.equal(stats.totalEntries, 20);
  assert.equal(stats.settledTrades, 19);
  assert.equal(getUnsettledCount(stats), 1);
  assert.equal(getCompletionRate(stats), 95);

  // 決着数が開始数を上回る異常データでも成立率は100%にクランプ、未決着は0以上
  assert.equal(
    getCompletionRate({ totalEntries: 3, settledTrades: 5 }),
    100,
  );
  assert.equal(getUnsettledCount({ totalEntries: 3, settledTrades: 5 }), 0);
});

test('normalizeStats が旧バージョンデータ（totalEntries / settledTrades 欠損）や不整合データを安全に補正する', () => {
  const migrated = normalizeStats({
    wins: 8,
    losses: 4,
    streak: 2,
    maxStreak: 5,
    totalPnl: 200,
    comebackWins: 1,
  });
  assert.equal(migrated.settledTrades, 12);
  assert.equal(migrated.totalEntries, 12);
  assert.equal(getCompletionRate(migrated), 100);

  // settledTrades > totalEntries の不整合データは totalEntries を引き上げる
  const clamped = normalizeStats({
    wins: 3,
    losses: 2,
    totalEntries: 2,
    settledTrades: 5,
  });
  assert.equal(clamped.settledTrades, 5);
  assert.equal(clamped.totalEntries, 5);
});
