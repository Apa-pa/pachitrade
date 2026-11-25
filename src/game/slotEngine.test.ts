import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyMomentum,
  createIdleSpin,
  createMidCherryWinSpin,
  createRareTriggerWinSpin,
  createReachEyeWinSpin,
  createSevenWinSpin,
  createSkullLoseSpin,
  createSkullOmenLoseSpin,
  inspectGrid,
  rollLoseSequencePattern,
  rollSlotSpin,
  rollWinSequencePattern,
  type SlotSpinResult,
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
  const info = inspectGrid(res.reels);
  assert.equal(info.hasVerticalDuplicate, false, `${res.role}: 縦重複禁止`);
  assert.equal(info.hasBarAligned, false, `${res.role}: BAR揃い禁止`);

  if (res.role !== 'SKULL' && res.role !== 'SKULL_OMEN') {
    assert.equal(info.skullCount, 0, `${res.role}: 負け以外でドクロ禁止`);
  }

  if (res.role !== 'REACH_EYE') {
    assert.equal(
      info.isMidRepRepSeven,
      false,
      `${res.role}: 通常回転・他役では中段リプ・リプ・7禁止`,
    );
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

  if (res.role !== 'CHANCE_EYE') {
    assert.equal(
      info.watermelonTenpaiLines.length,
      0,
      `${res.role}: チャンス目以外でスイカテンパイハズレ禁止`,
    );
  }
}

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
    const loseRes = rollSlotSpin('toward_lose', seqRng([b, 0.2, 0.4, 0.6]));
    assert.equal(loseRes.role, 'MISS');
  }

  let fastRare = 0;
  for (const b of buckets) {
    const res = rollSlotSpin('fast_win', seqRng([b, 0.3, 0.5, 0.7]));
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
    const res = rollSlotSpin('stagnant', seqRng([b, 0.3, 0.5, 0.7]));
    if (res.role === 'REPLAY' || res.role === 'BELL') {
      stagnantRole += 1;
    }
  }
  assert.equal(stagnantRole, 75);

  let mildMiss = 0;
  for (const b of buckets) {
    const res = rollSlotSpin('mild_win', seqRng([b, 0.3, 0.5, 0.7]));
    if (res.role === 'MISS') {
      mildMiss += 1;
    }
  }
  assert.equal(mildMiss, 58);
});

test('5ライン不変条件（BAR非揃い・左チェリー・スイカテンパイ・リーチ目非混入・ドクロ非混入）が数百回成立する', () => {
  const momentums = ['fast_win', 'mild_win', 'stagnant', 'toward_lose'] as const;

  for (const m of momentums) {
    for (let i = 0; i < 80; i++) {
      const res = rollSlotSpin(m);
      assertCommonInvariants(res);
      const info = inspectGrid(res.reels);

      switch (res.role) {
        case 'MISS':
          assert.equal(info.alignedLines.length, 0);
          assert.equal(info.sevenTenpaiLines.length, 0);
          break;
        case 'WEAK_CHERRY':
          assert.equal(info.alignedLines.length, 0);
          assert.equal(info.leftCherryRows.length, 1);
          assert.ok(info.leftCherryRows[0] === 0 || info.leftCherryRows[0] === 2);
          break;
        case 'TRIPLE_CHERRY':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, 'CHERRY');
          break;
        case 'CHANCE_EYE':
          assert.equal(info.alignedLines.length, 0);
          assert.equal(info.watermelonTenpaiLines.length, 1);
          break;
        case 'WATERMELON':
        case 'BELL':
        case 'REPLAY':
          assert.equal(info.alignedLines.length, 1);
          assert.equal(info.alignedLines[0].symbol, res.role);
          break;
      }
    }
  }
});

test('確定役中段チェリー・リーチ目(リプリプ7)・通常レア役・中段7揃い・ドクロ前兆・中段ドクロ揃いが仕様通り生成される', () => {
  for (let i = 0; i < 30; i++) {
    const midCherry = createMidCherryWinSpin();
    assertCommonInvariants(midCherry);
    assert.deepEqual(inspectGrid(midCherry.reels).leftCherryRows, [1]);

    const reachEye = createReachEyeWinSpin();
    assertCommonInvariants(reachEye);
    const reachInfo = inspectGrid(reachEye.reels);
    assert.equal(reachEye.role, 'REACH_EYE');
    assert.equal(reachInfo.isMidRepRepSeven, true);
    assert.equal(reachInfo.alignedLines.length, 0);

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
    assert.equal(sevenInfo.alignedLines[0].line, 'MID');
    assert.equal(sevenInfo.alignedLines[0].symbol, 'SEVEN');

    const skullOmen = createSkullOmenLoseSpin();
    assertCommonInvariants(skullOmen);
    const omenInfo = inspectGrid(skullOmen.reels);
    assert.equal(skullOmen.role, 'SKULL_OMEN');
    assert.ok(omenInfo.skullCount >= 2);
    assert.equal(omenInfo.alignedLines.length, 0);
    assert.equal(skullOmen.highlightCells.length, omenInfo.skullCount);

    const skullSpin = createSkullLoseSpin();
    assertCommonInvariants(skullSpin);
    const skullInfo = inspectGrid(skullSpin.reels);
    assert.equal(skullInfo.alignedLines.length, 1);
    assert.equal(skullInfo.alignedLines[0].line, 'MID');
    assert.equal(skullInfo.alignedLines[0].symbol, 'SKULL');
  }

  const idle = createIdleSpin();
  assertCommonInvariants(idle);
  assert.equal(inspectGrid(idle.reels).alignedLines.length, 0);
});
