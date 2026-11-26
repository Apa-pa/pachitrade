import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendTradeRecord,
  buildShareText,
  filterTradeRecords,
  summarizeTradeRecords,
  trimTradeHistory,
} from './statsHistory.ts';
import type { TradeRecord } from './types.ts';

test('summarizeTradeRecords が収支・平均収支・勝率・最大連勝・最大連敗を正しく集計する', () => {
  const records: TradeRecord[] = [
    { t: 1000, o: 'W', p: 50, s: 'L' },
    { t: 2000, o: 'W', p: 30, s: 'S' },
    { t: 3000, o: 'L', p: -20, s: 'L' },
    { t: 4000, o: 'L', p: -20, s: 'L' },
    { t: 5000, o: 'L', p: -50, s: 'S' },
    { t: 6000, o: 'W', p: 100, s: 'L' },
  ];

  const summary = summarizeTradeRecords(records);
  assert.equal(summary.totalTrades, 6);
  assert.equal(summary.wins, 3);
  assert.equal(summary.losses, 3);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.totalPnl, 90);
  assert.equal(summary.avgPnl, 15);
  assert.equal(summary.maxWinStreak, 2);
  assert.equal(summary.maxLoseStreak, 3);
});

test('filterTradeRecords が今日1日・直近N件・全履歴を正しく抽出する', () => {
  const todayBase = new Date(2026, 10, 26, 12, 0, 0).getTime();
  const yesterday = new Date(2026, 10, 25, 23, 59, 0).getTime();

  const history: TradeRecord[] = [
    { t: yesterday, o: 'L', p: -50, s: 'L' },
    { t: todayBase - 3600_000, o: 'W', p: 20, s: 'L' },
    { t: todayBase - 1800_000, o: 'W', p: 30, s: 'S' },
    { t: todayBase, o: 'L', p: -20, s: 'L' },
  ];

  const todayOnly = filterTradeRecords(history, { kind: 'today' }, todayBase);
  assert.equal(todayOnly.length, 3);
  assert.equal(todayOnly[0].p, 20);

  const recent2 = filterTradeRecords(
    history,
    { kind: 'recent', count: 2 },
    todayBase,
  );
  assert.equal(recent2.length, 2);
  assert.deepEqual(
    recent2.map((r) => r.p),
    [30, -20],
  );

  const all = filterTradeRecords(history, { kind: 'all' }, todayBase);
  assert.equal(all.length, 4);
});

test('appendTradeRecord と trimTradeHistory が上限を超えた古いレコードを除去する', () => {
  let history: TradeRecord[] = [];
  for (let i = 1; i <= 120; i++) {
    history = appendTradeRecord(
      history,
      { t: i * 1000, o: i % 2 === 0 ? 'W' : 'L', p: i, s: 'L' },
      100,
    );
  }
  assert.equal(history.length, 100);
  assert.equal(history[0].p, 21);
  assert.equal(history[99].p, 120);

  const trimmed = trimTradeHistory(history, 50);
  assert.equal(trimmed.length, 50);
  assert.equal(trimmed[0].p, 71);
});

test('buildShareText に名前・収支・平均収支・勝率・最大連勝・最大連敗が含まれ逆転回数は含まれない', () => {
  const summary = summarizeTradeRecords([
    { t: 1, o: 'W', p: 50, s: 'L' },
    { t: 2, o: 'W', p: 50, s: 'L' },
    { t: 3, o: 'L', p: -20, s: 'S' },
  ]);
  const text = buildShareText({
    playerName: 'テスト太郎',
    filter: { kind: 'recent', count: 100 },
    summary,
    unit: 'USDT',
  });

  assert.ok(text.includes('テスト太郎の直近100トレード'));
  assert.ok(text.includes('+80 USDT'));
  assert.ok(text.includes('平均 +26.7 USDT'));
  assert.ok(text.includes('最大連勝: 2連'));
  assert.ok(text.includes('最大連敗: 1連'));
  assert.ok(!text.includes('逆転'));
  assert.ok(text.includes('https://pachitrade.papan-shiki.com/'));
});
