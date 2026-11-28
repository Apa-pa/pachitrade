import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGridFromStops,
  classifyMomentum,
  createIdleSpin,
  createMidCherryWinSpin,
  createRareTriggerWinSpin,
  createReachEyeWinSpin,
  createSevenWinSpin,
  createSkullLoseSpin,
  createSkullOmenLoseSpin,
  getReelColumn,
  inspectGrid,
  REEL_STRIPS,
  ROLE_STOP_TABLES,
  rollLoseSequencePattern,
  rollSlotSpin,
  rollWinSequencePattern,
  type ReelIndex,
  type SlotRole,
  type SlotSpinResult,
  type StopPosition,
} from './slotEngine.ts';

/** 決定論的な乱数配列を順番に返すヘルパー */
function seqRng(values: number[]): () => number {
  let idx = 0;
  return () => {
    const val = values[idx % values.length];
    idx += 1;
    return val;
  };
}

/** 全役共通の厳密パチスロ不変条件をチェック */
function assertCommonInvariants(res: SlotSpinResult) {
  assert.deepEqual(
    res.reels,
    buildGridFromStops(res.stopPositions),
    `${res.role}: stopPositions と reels が一致すること`,
  );

  const info = inspectGrid(res.reels);
  assert.equal(info.hasVerticalDuplicate, false, `${res.role}: 縦重複禁止`);
  assert.equal(info.hasBarAligned, false, `${res.role}: BAR揃い禁止`);
  assert.equal(
    info.isMidRepRepSeven,
    false,
    `${res.role}: 旧リーチ目（中段リプ・リプ・7）は廃止`,
  );

  if (res.role !== 'SKULL' && res.role !== 'SKULL_OMEN') {
    assert.equal(info.midRightSkullCount, 0, `${res.role}: 中・右にドクロ非停止`);
    if (res.role === 'MISS') {
      assert.ok(info.skullCount <= 1, 'MISS: 遅押しブレでもドクロは左の最大1個');
    } else {
      assert.equal(info.skullCount, 0, `${res.role}: 通常小役・勝ち役でドクロ禁止`);
    }
  }

  if (
    res.role !== 'WEAK_CHERRY' &&
    res.role !== 'TRIPLE_CHERRY' &&
    res.role !== 'MID_CHERRY'
  ) {
    assert.equal(
      info.leftCherryRows.length,
      0,
      `${res.role}: チェリー系以外で左リールにチェリー禁止`,
    );
  }
}

test('REEL_STRIPS が各12コマで、ループ上の連続3コマに重複図柄がないこと', () => {
  assert.deepEqual(REEL_STRIPS[0], [
    'SEVEN',
    'WATERMELON',
    'REPLAY',
    'BELL',
    'BAR',
    'CHERRY',
    'REPLAY',
    'BELL',
    'SKULL',
    'WATERMELON',
    'REPLAY',
    'BELL',
  ]);
  assert.deepEqual(REEL_STRIPS[1], [
    'SEVEN',
    'REPLAY',
    'BELL',
    'WATERMELON',
    'CHERRY',
    'REPLAY',
    'BELL',
    'BAR',
    'SKULL',
    'REPLAY',
    'BELL',
    'WATERMELON',
  ]);
  assert.deepEqual(REEL_STRIPS[2], [
    'SEVEN',
    'BELL',
    'REPLAY',
    'CHERRY',
    'WATERMELON',
    'BELL',
    'REPLAY',
    'BAR',
    'SKULL',
    'REPLAY',
    'BELL',
    'WATERMELON',
  ]);

  for (const reelIdx of [0, 1, 2] as const satisfies readonly ReelIndex[]) {
    assert.equal(REEL_STRIPS[reelIdx].length, 12);
    for (let pos = 1; pos <= 12; pos += 1) {
      const col = getReelColumn(reelIdx, pos as StopPosition);
      assert.equal(
        new Set(col).size,
        3,
        `reel ${reelIdx} pos ${pos}: 連続3コマに重複あり (${col.join(',')})`,
      );
    }
  }
});

test('ROLE_STOP_TABLES の全役合計重みが100であり、全エントリが仕様通りであること', () => {
  const roles = Object.keys(ROLE_STOP_TABLES) as SlotRole[];
  assert.equal(roles.length, 12);

  for (const role of roles) {
    const table = ROLE_STOP_TABLES[role];
    const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
    assert.equal(totalWeight, 100, `${role}: 重み合計は100`);

    for (const entry of table) {
      for (const stop of entry.stops) {
        assert.ok(stop >= 1 && stop <= 12 && Number.isInteger(stop));
      }
      const reels = buildGridFromStops(entry.stops);
      const info = inspectGrid(reels);
      assert.equal(info.hasVerticalDuplicate, false);
      assert.equal(info.hasBarAligned, false);
      assert.equal(info.isMidRepRepSeven, false);
    }
  }
});

test('classifyMomentum が進捗速度と現在進捗率から勢いを正しく分類する', () => {
  assert.equal(classifyMomentum(15, 30), 'fast_win');
  assert.equal(classifyMomentum(6, 70), 'fast_win');
  assert.equal(classifyMomentum(-8, 10), 'toward_lose');
  assert.equal(classifyMomentum(0, -45), 'toward_lose');
  assert.equal(classifyMomentum(2, 20), 'stagnant');
  assert.equal(classifyMomentum(-4, 15), 'stagnant');
  assert.equal(classifyMomentum(8, 25), 'mild_win');
});

test('勝ち確定4パターンが各25%、負け確定2パターンが各50%で抽選される', () => {
  const buckets = Array.from({ length: 100 }, (_, i) => i / 100);

  const winCounts = {
    mid_cherry: 0,
    direct_seven: 0,
    reach_eye: 0,
    rare_trigger: 0,
  };
  for (const b of buckets) {
    const p = rollWinSequencePattern(() => b);
    winCounts[p] += 1;
  }
  assert.deepEqual(winCounts, {
    mid_cherry: 25,
    direct_seven: 25,
    reach_eye: 25,
    rare_trigger: 25,
  });

  const loseCounts = {
    skull_omen: 0,
    direct_skull: 0,
  };
  for (const b of buckets) {
    const p = rollLoseSequencePattern(() => b);
    loseCounts[p] += 1;
  }
  assert.deepEqual(loseCounts, {
    skull_omen: 50,
    direct_skull: 50,
  });
});

test('勢い別の確率分布と、通常抽選に確定専用役が混入しないこと', () => {
  const buckets = Array.from({ length: 100 }, (_, i) => i / 100);

  for (const b of buckets) {
    const loseRes = rollSlotSpin('toward_lose', seqRng([b, 0.2]));
    assert.equal(loseRes.role, 'MISS');
  }

  let fastRare = 0;
  for (const b of buckets) {
    const res = rollSlotSpin('fast_win', seqRng([b, 0.3]));
    assert.notEqual(res.role, 'MID_CHERRY');
    assert.notEqual(res.role, 'REACH_EYE');
    assert.notEqual(res.role, 'SKULL');
    assert.notEqual(res.role, 'SKULL_OMEN');
    if (
      res.role === 'WEAK_CHERRY' ||
      res.role === 'WATERMELON' ||
      res.role === 'CHANCE_EYE' ||
      res.role === 'TRIPLE_CHERRY'
    ) {
      fastRare += 1;
    }
  }
  assert.equal(fastRare, 82);

  let stagnantRole = 0;
  for (const b of buckets) {
    const res = rollSlotSpin('stagnant', seqRng([b, 0.3]));
    if (res.role === 'REPLAY' || res.role === 'BELL') {
      stagnantRole += 1;
    }
  }
  assert.equal(stagnantRole, 75);

  let mildMiss = 0;
  for (const b of buckets) {
    const res = rollSlotSpin('mild_win', seqRng([b, 0.3]));
    if (res.role === 'MISS') {
      mildMiss += 1;
    }
  }
  assert.equal(mildMiss, 58);
});

test('全12役の目押しブレ確率分布が仕様通りの比率で抽選されること', () => {
  const buckets = Array.from({ length: 100 }, (_, i) => i / 100);

  const countStops = (fn: (b: number) => SlotSpinResult) => {
    const counts = new Map<string, number>();
    for (const b of buckets) {
      const res = fn(b);
      assertCommonInvariants(res);
      const key = res.stopPositions.join('-');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Object.fromEntries(counts);
  };

  assert.deepEqual(
    countStops((b) => rollSlotSpin('toward_lose', seqRng([0, b]))),
    { '3-5-6': 20, '3-10-2': 20, '3-3-10': 15, '3-12-5': 15, '11-5-6': 20, '7-5-6': 10 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('stagnant', seqRng([0.1, b]))),
    { '3-6-3': 65, '11-10-3': 20, '2-5-6': 15 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('stagnant', seqRng([0.5, b]))),
    { '3-2-5': 70, '11-6-1': 20, '12-2-12': 10 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('mild_win', seqRng([0.95, b]))),
    { '2-3-10': 70, '10-4-5': 30 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('mild_win', seqRng([0.99, b]))),
    { '2-3-6': 40, '10-3-6': 10, '12-2-2': 50 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('fast_win', seqRng([0.1, b]))),
    { '4-6-10': 80, '6-6-10': 20 },
  );
  assert.deepEqual(
    countStops((b) => rollSlotSpin('fast_win', seqRng([0.7, b]))),
    { '4-4-4': 70, '6-4-2': 30 },
  );
  assert.deepEqual(
    countStops((b) => createMidCherryWinSpin(() => b)),
    { '5-12-12': 70, '5-6-6': 30 },
  );
  assert.deepEqual(
    countStops((b) => createSevenWinSpin(() => b)),
    { '12-12-12': 60, '1-12-11': 25, '11-12-1': 15 },
  );
  assert.deepEqual(
    countStops((b) => createSkullOmenLoseSpin(() => b)),
    { '8-8-10': 50, '7-5-7': 30, '7-9-7': 20 },
  );
  assert.deepEqual(
    countStops((b) => createSkullLoseSpin(() => b)),
    { '8-8-8': 75, '9-8-7': 25 },
  );
  assert.deepEqual(
    countStops((b) => createReachEyeWinSpin(() => b)),
    { '3-12-1': 50, '10-4-11': 50 },
  );
});

test('通常回転全役の不変条件（ハズレ・リプ・ベル・スイカ・チャンス目A/B・単チェリー・3連チェリー）が成立する', () => {
  const momentums = ['fast_win', 'mild_win', 'stagnant', 'toward_lose'] as const;

  for (const m of momentums) {
    for (let i = 0; i < 100; i++) {
      const res = rollSlotSpin(m);
      assertCommonInvariants(res);
      const info = inspectGrid(res.reels);

      switch (res.role) {
        case 'MISS':
          assert.equal(info.alignedLines.length, 0);
          assert.equal(info.sevenTenpaiLines.length, 0);
          assert.equal(info.midRightSkullCount, 0);
          assert.ok(info.skullCount <= 1);
          break;
        case 'WEAK_CHERRY':
          assert.equal(info.alignedLines.length, 0);
          assert.equal(info.leftCherryRows.length, 1);
          assert.ok(info.leftCherryRows[0] === 0 || info.leftCherryRows[0] === 2);
          assert.equal(info.midRightCherryCount, 0);
          break;
        case 'TRIPLE_CHERRY':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, 'CHERRY');
          assert.ok(
            info.alignedLines[0].line === 'DIAG_UP' ||
              info.alignedLines[0].line === 'DIAG_DOWN',
          );
          break;
        case 'CHANCE_EYE':
          assert.equal(info.alignedLines.length, 0);
          if (info.isSmallVBell) {
            assert.equal(res.stopPositions.join('-'), '12-2-2');
          } else {
            assert.deepEqual(info.watermelonTenpaiLines, ['DIAG_DOWN']);
            assert.equal(res.reels[2][2], 'BAR');
          }
          break;
        case 'WATERMELON':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, 'WATERMELON');
          assert.ok(
            info.alignedLines[0].line === 'DIAG_DOWN' ||
              info.alignedLines[0].line === 'TOP',
          );
          break;
        case 'BELL':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, 'BELL');
          assert.ok(
            info.alignedLines[0].line === 'MID' ||
              info.alignedLines[0].line === 'DIAG_DOWN',
          );
          break;
        case 'REPLAY':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, 'REPLAY');
          assert.ok(
            info.alignedLines[0].line === 'TOP' ||
              info.alignedLines[0].line === 'MID',
          );
          break;
      }
    }
  }
});

test('確定役中段チェリー・リーチ目A/B・通常レア役・7揃い・ドクロ前兆・ドクロ揃い・待機出目が仕様通り生成される', () => {
  for (let i = 0; i < 40; i++) {
    const midCherry = createMidCherryWinSpin();
    assertCommonInvariants(midCherry);
    assert.deepEqual(inspectGrid(midCherry.reels).leftCherryRows, [1]);
    if (midCherry.stopPositions.join('-') === '5-12-12') {
      assert.equal(midCherry.reels[1][1], 'SEVEN');
      assert.equal(midCherry.reels[2][1], 'SEVEN');
    }

    const reachEye = createReachEyeWinSpin();
    assertCommonInvariants(reachEye);
    const reachInfo = inspectGrid(reachEye.reels);
    assert.equal(reachEye.role, 'REACH_EYE');
    assert.equal(reachInfo.alignedLines.length, 0);
    assert.equal(reachInfo.isMidRepRepSeven, false);
    assert.ok(
      reachInfo.isDiagonalBarSevenReach || reachInfo.isTopWatermelonReach,
      'リーチ目Aまたはリーチ目Bのいずれかであること',
    );

    const rareTrigger = createRareTriggerWinSpin();
    assertCommonInvariants(rareTrigger);
    assert.ok(
      rareTrigger.role === 'WEAK_CHERRY' ||
        rareTrigger.role === 'WATERMELON' ||
        rareTrigger.role === 'CHANCE_EYE' ||
        rareTrigger.role === 'TRIPLE_CHERRY',
    );

    const sevenSpin = createSevenWinSpin();
    assertCommonInvariants(sevenSpin);
    const sevenInfo = inspectGrid(sevenSpin.reels);
    assert.equal(sevenInfo.alignedLines.length, 1);
    assert.equal(sevenInfo.alignedLines[0].symbol, 'SEVEN');
    assert.ok(
      sevenInfo.alignedLines[0].line === 'MID' ||
        sevenInfo.alignedLines[0].line === 'DIAG_DOWN' ||
        sevenInfo.alignedLines[0].line === 'DIAG_UP',
    );

    const skullOmen = createSkullOmenLoseSpin();
    assertCommonInvariants(skullOmen);
    const omenInfo = inspectGrid(skullOmen.reels);
    assert.equal(skullOmen.role, 'SKULL_OMEN');
    assert.ok(omenInfo.skullCount >= 2);
    assert.equal(omenInfo.alignedLines.length, 0);
    assert.equal(skullOmen.highlightCells.length, omenInfo.skullCount);
    for (const cell of skullOmen.highlightCells) {
      assert.equal(skullOmen.reels[cell.reel][cell.row], 'SKULL');
    }

    const skullSpin = createSkullLoseSpin();
    assertCommonInvariants(skullSpin);
    const skullInfo = inspectGrid(skullSpin.reels);
    assert.equal(skullInfo.alignedLines.length, 1);
    assert.equal(skullInfo.alignedLines[0].symbol, 'SKULL');
    assert.ok(
      skullInfo.alignedLines[0].line === 'MID' ||
        skullInfo.alignedLines[0].line === 'DIAG_DOWN',
    );
  }

  const idle = createIdleSpin();
  assertCommonInvariants(idle);
  assert.equal(inspectGrid(idle.reels).alignedLines.length, 0);
  assert.equal(inspectGrid(idle.reels).skullCount, 0);
});
