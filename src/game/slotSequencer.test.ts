import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdleSpin, type SlotRole, type SlotSpinResult } from './slotEngine.ts';
import {
  NORMAL_DISPLAY_DWELL_MS,
  NORMAL_LEFT_STOP_MS,
  NORMAL_LEFT_TO_MID_MS,
  NORMAL_LEFT_TO_RIGHT_MS,
  SEVEN_LEFT_TO_MID_MS,
  SEVEN_LEFT_TO_RIGHT_MS,
  SEVEN_RIGHT_TO_CELEBRATE_MS,
  SEVEN_RIGHT_TO_COMPLETE_MS,
  SEVEN_SPIN_LEFT_STOP_MS,
  SlotSpinSequencer,
  type SlotLocalPhase,
  type SlotSequencerTimerApi,
  type SlotSpinRoleHit,
  type TimerHandle,
} from './slotSequencer.ts';

interface ScheduledTask {
  id: number;
  runAt: number;
  fn: () => void;
}

/** 決定論的にタイマー進行を検証できる仮想クロック */
class FakeClock {
  now = 0;
  private nextId = 1;
  private tasks = new Map<number, ScheduledTask>();

  readonly api: SlotSequencerTimerApi = {
    setTimeout: (fn: () => void, ms: number): TimerHandle => {
      const id = this.nextId;
      this.nextId += 1;
      this.tasks.set(id, {
        id,
        runAt: this.now + Math.max(0, ms),
        fn,
      });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle: TimerHandle): void => {
      this.tasks.delete(handle as unknown as number);
    },
  };

  pendingCount(): number {
    return this.tasks.size;
  }

  advanceBy(ms: number): void {
    const target = this.now + ms;
    while (true) {
      let nextTask: ScheduledTask | null = null;
      for (const task of this.tasks.values()) {
        if (task.runAt > target) continue;
        if (
          !nextTask ||
          task.runAt < nextTask.runAt ||
          (task.runAt === nextTask.runAt && task.id < nextTask.id)
        ) {
          nextTask = task;
        }
      }
      if (!nextTask) break;
      this.tasks.delete(nextTask.id);
      this.now = nextTask.runAt;
      nextTask.fn();
    }
    this.now = target;
  }
}

/** 最初の1回だけ指定乱数を返し、以降は散らばった値を巡回する決定論RNG */
function withFirstRng(firstValue: number, rest: number[] = [0.17, 0.43, 0.71, 0.29, 0.61, 0.89]): () => number {
  let count = 0;
  return () => {
    if (count === 0) {
      count += 1;
      return firstValue;
    }
    const val = rest[(count - 1) % rest.length];
    count += 1;
    return val;
  };
}

interface HarnessOptions {
  rng?: () => number;
  initialProgress?: number;
  initialProgressDelta?: number;
}

/** テスト用のシーケンサー・状態・呼び出しログ観測ハーネス */
function createHarness(options: HarnessOptions = {}) {
  const clock = new FakeClock();
  let progress = options.initialProgress ?? 0;
  let progressDelta = options.initialProgressDelta ?? 0;

  const state = {
    spinResult: createIdleSpin() as SlotSpinResult,
    spinning: [false, false, false] as [boolean, boolean, boolean],
    flashPayline: false,
    localPhase: 'idle' as SlotLocalPhase,
    normalCycleActive: false,
    history: [] as SlotRole[],
    midCherryActive: false,
    sevenAlignedCount: 0,
    completePendingWinCount: 0,
    skullAlignedCount: 0,
    completePendingLoseCount: 0,
    leverOnCount: 0,
    reelStartCount: 0,
    reelStopCalls: [] as { at: number; isSeven: boolean }[],
    reelTenpaiCount: 0,
    slotRoleHitCalls: [] as { at: number; role: SlotSpinRoleHit }[],
    reachEyeCount: 0,
    skullOmenCount: 0,
    events: [] as { at: number; type: string }[],
  };

  const record = (type: string) => {
    state.events.push({ at: clock.now, type });
  };

  const sequencer = new SlotSpinSequencer(
    {
      getProgress: () => progress,
      getProgressDelta: () => progressDelta,
      onSpinResultChange: (result) => {
        state.spinResult = result;
        record(`spinResult:${result.role}`);
      },
      onSpinningChange: (next) => {
        state.spinning = next;
        record(`spinning:${next.map((b) => (b ? '1' : '0')).join('')}`);
      },
      onFlashPaylineChange: (flash) => {
        state.flashPayline = flash;
      },
      onLocalPhaseChange: (phase) => {
        state.localPhase = phase;
        record(`phase:${phase}`);
      },
      onNormalCycleActiveChange: (active) => {
        state.normalCycleActive = active;
      },
      onAppendHistory: (role) => {
        state.history = [role, ...state.history].slice(0, 5);
        record(`history:${role}`);
      },
      onMidCherryActiveChange: (active) => {
        state.midCherryActive = active;
        record(`midCherry:${active}`);
      },
      onSevenAligned: () => {
        state.sevenAlignedCount += 1;
        record('sevenAligned');
      },
      onCompletePendingWin: () => {
        state.completePendingWinCount += 1;
        record('completeWin');
      },
      onSkullAligned: () => {
        state.skullAlignedCount += 1;
        record('skullAligned');
      },
      onCompletePendingLose: () => {
        state.completePendingLoseCount += 1;
        record('completeLose');
      },
      playLeverOn: () => {
        state.leverOnCount += 1;
        record('playLeverOn');
      },
      playReelStart: () => {
        state.reelStartCount += 1;
        record('playReelStart');
      },
      playReelStop: (isSeven) => {
        state.reelStopCalls.push({ at: clock.now, isSeven });
        record(`playReelStop:${isSeven}`);
      },
      playReelTenpai: () => {
        state.reelTenpaiCount += 1;
        record('playReelTenpai');
      },
      playSlotRoleHit: (role) => {
        state.slotRoleHitCalls.push({ at: clock.now, role });
        record(`playSlotRoleHit:${role}`);
      },
      playReachEye: () => {
        state.reachEyeCount += 1;
        record('playReachEye');
      },
      playSkullOmen: () => {
        state.skullOmenCount += 1;
        record('playSkullOmen');
      },
    },
    {
      timers: clock.api,
      rng: options.rng ?? withFirstRng(0.1),
    },
  );

  return {
    clock,
    state,
    sequencer,
    setMomentumInputs: (nextProgress: number, nextDelta: number) => {
      progress = nextProgress;
      progressDelta = nextDelta;
    },
  };
}

test('通常サイクルが 0ms → 750ms → 1020ms → 1300ms → 3000ms の順で完走し出目表示を1700ms維持する', () => {
  // stagnant で roll=0.1 → REPLAY 当選
  const { clock, state, sequencer } = createHarness({
    rng: withFirstRng(0.1),
    initialProgress: 10,
    initialProgressDelta: 1,
  });

  sequencer.sync({
    positionId: 'pos-1',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });

  assert.equal(sequencer.getMode(), 'normal_spinning_before_left');
  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.reelStartCount, 1);
  assert.equal(state.normalCycleActive, true);

  clock.advanceBy(NORMAL_LEFT_STOP_MS - 1);
  assert.deepEqual(state.spinning, [true, true, true]);

  clock.advanceBy(1);
  assert.equal(clock.now, 750);
  assert.equal(sequencer.getMode(), 'normal_stopping');
  assert.deepEqual(state.spinning, [false, true, true]);
  assert.equal(state.spinResult.role, 'REPLAY');
  assert.equal(state.reelStopCalls.length, 1);

  clock.advanceBy(NORMAL_LEFT_TO_MID_MS - 1);
  assert.deepEqual(state.spinning, [false, true, true]);
  clock.advanceBy(1);
  assert.equal(clock.now, 1020);
  assert.deepEqual(state.spinning, [false, false, true]);
  assert.equal(state.reelStopCalls.length, 2);

  clock.advanceBy(NORMAL_LEFT_TO_RIGHT_MS - NORMAL_LEFT_TO_MID_MS - 1);
  assert.deepEqual(state.spinning, [false, false, true]);
  clock.advanceBy(1);
  assert.equal(clock.now, 1300);
  assert.equal(sequencer.getMode(), 'normal_displaying');
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.equal(state.reelStopCalls.length, 3);
  assert.deepEqual(state.history, ['REPLAY']);
  assert.equal(state.flashPayline, true);
  assert.equal(state.slotRoleHitCalls.length, 1);
  assert.equal(state.slotRoleHitCalls[0].role, 'REPLAY');

  // 右停止後 1699ms（合計2999ms）までは出目表示が維持される
  clock.advanceBy(NORMAL_DISPLAY_DWELL_MS - 1);
  assert.equal(clock.now, 2999);
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.equal(state.flashPayline, true);
  assert.equal(state.reelStartCount, 1);

  // 3000ms 到達で2回転目が開始される
  clock.advanceBy(1);
  assert.equal(clock.now, 3000);
  assert.equal(sequencer.getMode(), 'normal_spinning_before_left');
  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.flashPayline, false);
  assert.equal(state.reelStartCount, 2);

  sequencer.dispose();
});

test('通常回転中の大きな値動き（未決着）でも回転はカットされず、左停止時に最新勢いで抽選し完走する', () => {
  // 0.1 は stagnant なら REPLAY だが、fast_win なら WEAK_CHERRY（<0.24）
  const { clock, state, sequencer, setMomentumInputs } = createHarness({
    rng: withFirstRng(0.1),
    initialProgress: 0,
    initialProgressDelta: 0,
  });

  sequencer.sync({
    positionId: 'pos-1',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });

  // 回転中の 300ms で大きな値動き（未決着）が発生してもタイマーは中断されない
  clock.advanceBy(300);
  setMomentumInputs(72, 18);
  sequencer.sync({
    positionId: 'pos-1',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });

  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.reelStartCount, 1);

  // 750ms の左停止時点で最新勢い（fast_win）を使って抽選される
  clock.advanceBy(450);
  assert.equal(clock.now, 750);
  assert.deepEqual(state.spinning, [false, true, true]);
  assert.equal(state.spinResult.momentum, 'fast_win');
  assert.equal(state.spinResult.role, 'WEAK_CHERRY');

  // そのまま 1300ms まで停止し、3000ms で次回転へ進む
  clock.advanceBy(550);
  assert.equal(clock.now, 1300);
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.deepEqual(state.history, ['WEAK_CHERRY']);

  clock.advanceBy(1700);
  assert.equal(clock.now, 3000);
  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.reelStartCount, 2);

  sequencer.dispose();
});

test('左停止前（300ms）の勝ち確定全4パターンが二重回転せず750msからシームレスに完走する', () => {
  const sevenSequenceDuration =
    SEVEN_SPIN_LEFT_STOP_MS +
    SEVEN_LEFT_TO_RIGHT_MS +
    SEVEN_RIGHT_TO_COMPLETE_MS;
  const cases = [
    {
      name: 'direct_seven',
      firstRoll: 0.3,
      expectedFirstRole: 'SEVEN' as SlotRole,
      expectedSecondSpin: false,
      expectedFinishAt:
        750 + SEVEN_LEFT_TO_RIGHT_MS + SEVEN_RIGHT_TO_COMPLETE_MS,
      expectedHistory: ['SEVEN'] as SlotRole[],
    },
    {
      name: 'mid_cherry',
      firstRoll: 0.1,
      expectedFirstRole: 'MID_CHERRY' as SlotRole,
      expectedSecondSpin: true,
      expectedFinishAt: 750 + 2200 + sevenSequenceDuration,
      expectedHistory: ['SEVEN', 'MID_CHERRY'] as SlotRole[],
    },
    {
      name: 'reach_eye',
      firstRoll: 0.6,
      expectedFirstRole: 'REACH_EYE' as SlotRole,
      expectedSecondSpin: true,
      expectedFinishAt: 750 + 2350 + sevenSequenceDuration,
      expectedHistory: ['SEVEN', 'REACH_EYE'] as SlotRole[],
    },
    {
      name: 'rare_trigger',
      firstRoll: 0.85,
      expectedFirstRole: null,
      expectedSecondSpin: true,
      expectedFinishAt: 750 + 2200 + sevenSequenceDuration,
      expectedHistory: null,
    },
  ];

  for (const tc of cases) {
    const { clock, state, sequencer } = createHarness({
      rng: withFirstRng(tc.firstRoll),
    });

    sequencer.sync({
      positionId: 'pos-win',
      hasPendingWin: false,
      hasPendingLose: false,
      hasSettlement: false,
    });

    clock.advanceBy(300);
    sequencer.sync({
      positionId: null,
      hasPendingWin: true,
      hasPendingLose: false,
      hasSettlement: false,
    });

    // 300ms〜749ms は通常回転がそのまま継続し、playReelStart の二重再生は起きない
    assert.deepEqual(state.spinning, [true, true, true], tc.name);
    assert.equal(state.reelStartCount, 1, tc.name);

    clock.advanceBy(449);
    assert.deepEqual(state.spinning, [true, true, true], tc.name);
    assert.equal(state.reelStartCount, 1, tc.name);

    // 750ms でシームレスに決着シーケンス1回転目の左リールが停止
    clock.advanceBy(1);
    assert.equal(clock.now, 750, tc.name);
    assert.equal(sequencer.getMode(), 'settlement_running', tc.name);
    assert.deepEqual(state.spinning, [false, true, true], tc.name);
    assert.equal(state.reelStartCount, 1, tc.name);
    if (tc.expectedFirstRole) {
      assert.equal(state.spinResult.role, tc.expectedFirstRole, tc.name);
    }

    // 完了1ms前まではまだ完了しない
    clock.advanceBy(tc.expectedFinishAt - 750 - 1);
    assert.equal(state.completePendingWinCount, 0, tc.name);

    // 完了時刻に完走する
    clock.advanceBy(1);
    assert.equal(state.completePendingWinCount, 1, tc.name);
    assert.equal(state.sevenAlignedCount, 1, tc.name);
    assert.equal(sequencer.getMode(), 'idle', tc.name);
    assert.equal(
      state.reelStartCount,
      tc.expectedSecondSpin ? 2 : 1,
      tc.name,
    );
    if (tc.expectedHistory) {
      assert.deepEqual(state.history, tc.expectedHistory, tc.name);
    } else {
      assert.equal(state.history.length, 2, tc.name);
      assert.equal(state.history[0], 'SEVEN', tc.name);
    }

    sequencer.dispose();
  }
});

test('左停止前（400ms）の負け確定2パターンが二重回転せず750msからシームレスに完走する', () => {
  const cases = [
    {
      name: 'direct_skull',
      firstRoll: 0.7,
      expectedSecondSpin: false,
      expectedFinishAt: 750 + 2400,
    },
    {
      name: 'skull_omen',
      firstRoll: 0.2,
      expectedSecondSpin: true,
      expectedFinishAt: 750 + 2080 + 2750,
    },
  ];

  for (const tc of cases) {
    const { clock, state, sequencer } = createHarness({
      rng: withFirstRng(tc.firstRoll),
    });

    sequencer.sync({
      positionId: 'pos-lose',
      hasPendingWin: false,
      hasPendingLose: false,
      hasSettlement: false,
    });

    clock.advanceBy(400);
    sequencer.sync({
      positionId: null,
      hasPendingWin: false,
      hasPendingLose: true,
      hasSettlement: false,
    });

    assert.deepEqual(state.spinning, [true, true, true], tc.name);
    assert.equal(state.reelStartCount, 1, tc.name);

    clock.advanceBy(350);
    assert.equal(clock.now, 750, tc.name);
    assert.deepEqual(state.spinning, [false, true, true], tc.name);
    assert.equal(state.reelStartCount, 1, tc.name);

    clock.advanceBy(tc.expectedFinishAt - 750 - 1);
    assert.equal(state.completePendingLoseCount, 0, tc.name);

    clock.advanceBy(1);
    assert.equal(state.completePendingLoseCount, 1, tc.name);
    assert.equal(state.skullAlignedCount, 1, tc.name);
    assert.equal(sequencer.getMode(), 'idle', tc.name);
    assert.deepEqual(state.history, ['SKULL'], tc.name);
    assert.equal(
      state.reelStartCount,
      tc.expectedSecondSpin ? 2 : 1,
      tc.name,
    );

    sequencer.dispose();
  }
});

test('左停止後（850ms）および中停止後（1150ms）に決着しても進行中の停止と出目表示がカットされない', () => {
  // 1) 850ms（左停止後・中停止前）に勝ち確定（direct_seven）
  {
    const rngValues = [0.1, 0.3]; // 1回転目通常=REPLAY、決着=direct_seven
    let idx = 0;
    const { clock, state, sequencer } = createHarness({
      rng: () => {
        if (idx === 0) {
          idx += 1;
          return rngValues[0];
        }
        // 決着抽選の最初（通常抽選のリール埋め後のタイミング）で 0.3 を返せるよう、
        // 十分な位置でなくテストでは直接 rng を制御しやすい形で検証
        const val = idx < 25 ? 0.17 : rngValues[1];
        idx += 1;
        return val;
      },
      initialProgress: 0,
      initialProgressDelta: 0,
    });

    sequencer.sync({
      positionId: 'pos-mid',
      hasPendingWin: false,
      hasPendingLose: false,
      hasSettlement: false,
    });

    // 750ms で左停止
    clock.advanceBy(850);
    assert.deepEqual(state.spinning, [false, true, true]);
    const normalRole = state.spinResult.role;

    // 850ms で勝ち確定を同期してもカットされない
    sequencer.sync({
      positionId: null,
      hasPendingWin: true,
      hasPendingLose: false,
      hasSettlement: false,
    });
    assert.equal(sequencer.getMode(), 'normal_stopping');
    assert.deepEqual(state.spinning, [false, true, true]);

    // 1020ms 中停止、1300ms 右停止が通常通り完了する
    clock.advanceBy(170);
    assert.equal(clock.now, 1020);
    assert.deepEqual(state.spinning, [false, false, true]);

    clock.advanceBy(280);
    assert.equal(clock.now, 1300);
    assert.deepEqual(state.spinning, [false, false, false]);
    assert.deepEqual(state.history, [normalRole]);

    // 2999ms まで出目表示維持
    clock.advanceBy(1699);
    assert.equal(clock.now, 2999);
    assert.deepEqual(state.spinning, [false, false, false]);
    assert.equal(state.spinResult.role, normalRole);
    assert.equal(state.reelStartCount, 1);

    // 3000ms で初めて次の回転（勝ち確定シーケンス）が開始
    clock.advanceBy(1);
    assert.equal(clock.now, 3000);
    assert.equal(sequencer.getMode(), 'settlement_running');
    assert.deepEqual(state.spinning, [true, true, true]);
    assert.equal(state.reelStartCount, 2);

    // 勝ち確定演出が完了まで走る
    clock.advanceBy(10000);
    assert.equal(state.completePendingWinCount, 1);
    assert.equal(state.sevenAlignedCount, 1);

    sequencer.dispose();
  }

  // 2) 1150ms（中停止後・右停止前）に負け確定
  {
    const { clock, state, sequencer } = createHarness({
      rng: withFirstRng(0.8),
      initialProgress: -50,
      initialProgressDelta: -10,
    });

    sequencer.sync({
      positionId: 'pos-right',
      hasPendingWin: false,
      hasPendingLose: false,
      hasSettlement: false,
    });

    clock.advanceBy(1150);
    assert.deepEqual(state.spinning, [false, false, true]);

    sequencer.sync({
      positionId: null,
      hasPendingWin: false,
      hasPendingLose: true,
      hasSettlement: false,
    });

    // 右停止（1300ms）と表示維持（2999ms）がカットされない
    clock.advanceBy(150);
    assert.equal(clock.now, 1300);
    assert.deepEqual(state.spinning, [false, false, false]);
    assert.deepEqual(state.history, ['MISS']);

    clock.advanceBy(1699);
    assert.equal(clock.now, 2999);
    assert.deepEqual(state.spinning, [false, false, false]);
    assert.equal(state.reelStartCount, 1);

    // 3000ms で負け確定シーケンス開始
    clock.advanceBy(1);
    assert.equal(clock.now, 3000);
    assert.equal(sequencer.getMode(), 'settlement_running');
    assert.deepEqual(state.spinning, [true, true, true]);
    assert.equal(state.reelStartCount, 2);

    clock.advanceBy(10000);
    assert.equal(state.completePendingLoseCount, 1);
    assert.equal(state.skullAlignedCount, 1);

    sequencer.dispose();
  }
});

test('全リール停止後の出目表示中（1350ms）に決着しても1700ms維持後に決着シーケンスへ移行する', () => {
  const { clock, state, sequencer } = createHarness({
    rng: withFirstRng(0.1),
    initialProgress: 10,
    initialProgressDelta: 1,
  });

  sequencer.sync({
    positionId: 'pos-dwell',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });

  clock.advanceBy(1350);
  assert.equal(sequencer.getMode(), 'normal_displaying');
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.equal(state.flashPayline, true);

  // 1350ms で勝ち確定到達
  sequencer.sync({
    positionId: null,
    hasPendingWin: true,
    hasPendingLose: false,
    hasSettlement: false,
  });

  // 2999ms までは出目表示とラインフラッシュがカットされない
  clock.advanceBy(1649);
  assert.equal(clock.now, 2999);
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.equal(state.flashPayline, true);
  assert.equal(state.normalCycleActive, true);
  assert.equal(state.reelStartCount, 1);

  // 3000ms で次回転として勝ち確定シーケンス開始
  clock.advanceBy(1);
  assert.equal(clock.now, 3000);
  assert.equal(sequencer.getMode(), 'settlement_running');
  assert.equal(state.normalCycleActive, false);
  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.reelStartCount, 2);

  clock.advanceBy(10000);
  assert.equal(state.completePendingWinCount, 1);
  assert.equal(state.sevenAlignedCount, 1);

  sequencer.dispose();
});

test('モード切替等の強制リセットで即座にタイマー破棄・全停止し、再エントリーで正常再開する', () => {
  const { clock, state, sequencer } = createHarness({
    rng: withFirstRng(0.1),
  });

  // 回転中に強制リセット（positionId=null かつ pending なし）
  sequencer.sync({
    positionId: 'pos-1',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });
  clock.advanceBy(400);
  assert.ok(clock.pendingCount() > 0);
  assert.deepEqual(state.spinning, [true, true, true]);

  sequencer.sync({
    positionId: null,
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });
  assert.equal(sequencer.getMode(), 'idle');
  assert.equal(clock.pendingCount(), 0);
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.equal(state.flashPayline, false);
  assert.equal(state.midCherryActive, false);

  // 再エントリー（pos-2）で通常回転が再開する
  sequencer.sync({
    positionId: 'pos-2',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });
  assert.equal(sequencer.getMode(), 'normal_spinning_before_left');
  assert.deepEqual(state.spinning, [true, true, true]);

  // 決着シーケンス中に hasSettlement=true で強制リセット
  clock.advanceBy(300);
  sequencer.sync({
    positionId: null,
    hasPendingWin: true,
    hasPendingLose: false,
    hasSettlement: false,
  });
  clock.advanceBy(600); // 900ms: settlement_running 中
  assert.equal(sequencer.getMode(), 'settlement_running');
  assert.ok(clock.pendingCount() > 0);

  sequencer.sync({
    positionId: null,
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: true,
  });
  assert.equal(sequencer.getMode(), 'idle');
  assert.equal(clock.pendingCount(), 0);
  assert.deepEqual(state.spinning, [false, false, false]);

  // dispose 後はタイマーを進めても何も起きない
  sequencer.sync({
    positionId: 'pos-3',
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  });
  assert.ok(clock.pendingCount() > 0);
  const beforeEvents = state.events.length;
  sequencer.dispose();
  assert.equal(clock.pendingCount(), 0);
  clock.advanceBy(10000);
  assert.equal(state.events.length, beforeEvents);
});

test('7揃い時は左→中(+600ms)→右(+1050ms)のゆったりしたリズムで停止し、右停止バウンス後(+240ms)に祝福演出が発火する', () => {
  const { clock, state, sequencer } = createHarness({
    rng: withFirstRng(0.3), // direct_seven
  });

  sequencer.sync({
    positionId: null,
    hasPendingWin: true,
    hasPendingLose: false,
    hasSettlement: false,
  });

  assert.deepEqual(state.spinning, [true, true, true]);
  assert.equal(state.reelStartCount, 1);

  // 650ms で左リール停止（タン）
  clock.advanceBy(SEVEN_SPIN_LEFT_STOP_MS - 1);
  assert.deepEqual(state.spinning, [true, true, true]);
  clock.advanceBy(1);
  assert.equal(clock.now, SEVEN_SPIN_LEFT_STOP_MS);
  assert.deepEqual(state.spinning, [false, true, true]);
  assert.deepEqual(state.reelStopCalls, [{ at: 650, isSeven: true }]);

  // 左停止から +600ms（1250ms）で中リール停止（タン）＋テンパイ音
  clock.advanceBy(SEVEN_LEFT_TO_MID_MS - 1);
  assert.deepEqual(state.spinning, [false, true, true]);
  clock.advanceBy(1);
  assert.equal(clock.now, SEVEN_SPIN_LEFT_STOP_MS + SEVEN_LEFT_TO_MID_MS);
  assert.deepEqual(state.spinning, [false, false, true]);
  assert.equal(state.reelTenpaiCount, 1);

  // 中停止から +1050ms（左停止から +1650ms、合計2300ms）で右リール停止（・・・タン）
  const rightStopAt = SEVEN_SPIN_LEFT_STOP_MS + SEVEN_LEFT_TO_RIGHT_MS;
  clock.advanceBy(SEVEN_LEFT_TO_RIGHT_MS - SEVEN_LEFT_TO_MID_MS - 1);
  assert.deepEqual(state.spinning, [false, false, true]);
  clock.advanceBy(1);
  assert.equal(clock.now, rightStopAt);
  assert.deepEqual(state.spinning, [false, false, false]);
  assert.deepEqual(state.reelStopCalls, [
    { at: 650, isSeven: true },
    { at: rightStopAt, isSeven: true },
  ]);
  assert.equal(state.flashPayline, true);
  assert.equal(state.localPhase, 'seven');
  assert.deepEqual(state.history, ['SEVEN']);
  // 右停止直後はバウンス完了待ちのため全画面祝福演出はまだ発火しない
  assert.equal(state.sevenAlignedCount, 0);

  // 右停止から +240ms（バウンス完了後）に全画面祝福演出が発火
  clock.advanceBy(SEVEN_RIGHT_TO_CELEBRATE_MS - 1);
  assert.equal(state.sevenAlignedCount, 0);
  clock.advanceBy(1);
  assert.equal(clock.now, rightStopAt + SEVEN_RIGHT_TO_CELEBRATE_MS);
  assert.equal(state.sevenAlignedCount, 1);
  assert.equal(state.completePendingWinCount, 0);

  // 右停止から +2650ms で決着ダイアログへ遷移
  clock.advanceBy(SEVEN_RIGHT_TO_COMPLETE_MS - SEVEN_RIGHT_TO_CELEBRATE_MS - 1);
  assert.equal(state.completePendingWinCount, 0);
  clock.advanceBy(1);
  assert.equal(clock.now, rightStopAt + SEVEN_RIGHT_TO_COMPLETE_MS);
  assert.equal(state.completePendingWinCount, 1);
  assert.equal(sequencer.getMode(), 'idle');

  sequencer.dispose();
});
