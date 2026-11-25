import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySettlementToStats,
  calculateProgress,
  createPosition,
  determineEffectStage,
  evaluatePositionTick,
  isWinningStreak,
} from './engine.ts';
import type { GameStats } from './types.ts';

const baseStats: GameStats = {
  wins: 0,
  losses: 0,
  streak: 0,
  maxStreak: 0,
  totalPnl: 0,
  comebackWins: 0,
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
