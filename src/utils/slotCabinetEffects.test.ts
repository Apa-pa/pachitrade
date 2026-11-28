import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOWER_PANEL_BLACKOUT_PROBABILITY,
  resolveLowerPanelMode,
  resolveTopLampLedMode,
  rollLowerPanelBlackout,
  type LowerPanelInput,
  type TopLampLedInput,
} from './slotCabinetEffects.ts';

function createLedInput(overrides: Partial<TopLampLedInput> = {}): TopLampLedInput {
  return {
    hasPosition: false,
    progress: 0,
    sakibareActive: false,
    localPhase: 'idle',
    hasPendingWin: false,
    hasPendingLose: false,
    isWinSettled: false,
    isLoseSettled: false,
    ...overrides,
  };
}

function createLowerInput(
  overrides: Partial<LowerPanelInput> = {},
): LowerPanelInput {
  return {
    isRush: false,
    localPhase: 'idle',
    hasPendingWin: false,
    isBlackout: false,
    isWinSettled: false,
    isLoseSettled: false,
    ...overrides,
  };
}

test('resolveTopLampLedMode が待機中・保有中・先バレ・決着の全状態を正しく判定する', () => {
  // 待機中
  assert.equal(resolveTopLampLedMode(createLedInput()), 'idle');

  // ポジション保有中の進捗別
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: 15 })),
    'idle',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: 30 })),
    'chance',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: 60 })),
    'big_chance',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: 80 })),
    'gekiatsu',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: -69.9 })),
    'idle',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPosition: true, progress: -70 })),
    'pinch',
  );

  // 先バレ発生中は進捗よりも優先して激しくフラッシュ
  assert.equal(
    resolveTopLampLedMode(
      createLedInput({ hasPosition: true, progress: 0, sakibareActive: true }),
    ),
    'sakibare',
  );

  // 勝ち確定・負け確定の事前演出
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPendingWin: true })),
    'gekiatsu',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ localPhase: 'mid_cherry' })),
    'gekiatsu',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ localPhase: 'reach_eye' })),
    'gekiatsu',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ hasPendingLose: true })),
    'pinch',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ localPhase: 'skull_omen' })),
    'pinch',
  );

  // 決着（7揃い / WIN確定、ドクロ揃い / LOSE確定）が最優先
  assert.equal(
    resolveTopLampLedMode(
      createLedInput({
        hasPendingWin: true,
        sakibareActive: true,
        localPhase: 'seven',
      }),
    ),
    'win',
  );
  assert.equal(
    resolveTopLampLedMode(
      createLedInput({ isWinSettled: true, sakibareActive: true }),
    ),
    'win',
  );
  assert.equal(
    resolveTopLampLedMode(
      createLedInput({ hasPendingLose: true, localPhase: 'skull' }),
    ),
    'lose',
  );
  assert.equal(
    resolveTopLampLedMode(createLedInput({ isLoseSettled: true })),
    'lose',
  );
});

test('resolveLowerPanelMode が通常・RUSH/WIN点灯・LOSE暗め・勝ち確定消灯を正しく判定する', () => {
  // 通常時
  assert.equal(resolveLowerPanelMode(createLowerInput()), 'normal');

  // RUSH中・確定前兆・WIN
  assert.equal(resolveLowerPanelMode(createLowerInput({ isRush: true })), 'rush');
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ localPhase: 'mid_cherry' })),
    'rush',
  );
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ localPhase: 'reach_eye' })),
    'rush',
  );
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ localPhase: 'seven' })),
    'rush',
  );
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ isWinSettled: true })),
    'rush',
  );

  // 勝ち確定時の稀な下パネル消灯 → 7揃いで点灯復帰
  assert.equal(
    resolveLowerPanelMode(
      createLowerInput({ hasPendingWin: true, isBlackout: true }),
    ),
    'blackout',
  );
  assert.equal(
    resolveLowerPanelMode(
      createLowerInput({
        hasPendingWin: true,
        isBlackout: true,
        localPhase: 'seven',
      }),
    ),
    'rush',
  );
  assert.equal(
    resolveLowerPanelMode(
      createLowerInput({
        hasPendingWin: true,
        isBlackout: true,
        isWinSettled: true,
      }),
    ),
    'rush',
  );

  // LOSE時
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ localPhase: 'skull' })),
    'lose',
  );
  assert.equal(
    resolveLowerPanelMode(createLowerInput({ isLoseSettled: true })),
    'lose',
  );
});

test('rollLowerPanelBlackout が設定確率で抽選する', () => {
  assert.equal(rollLowerPanelBlackout(() => 0), true);
  assert.equal(
    rollLowerPanelBlackout(() => LOWER_PANEL_BLACKOUT_PROBABILITY - 0.001),
    true,
  );
  assert.equal(
    rollLowerPanelBlackout(() => LOWER_PANEL_BLACKOUT_PROBABILITY),
    false,
  );
  assert.equal(rollLowerPanelBlackout(() => 0.99), false);
});
