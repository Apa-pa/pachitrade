import type { SlotLocalPhase } from '../game/slotSequencer.ts';

/** 上部ランプ左右LEDの発光モード */
export type TopLampLedMode =
  | 'idle'
  | 'sakibare'
  | 'chance'
  | 'big_chance'
  | 'gekiatsu'
  | 'pinch'
  | 'win'
  | 'lose';

/** 下パネルの表示演出モード */
export type LowerPanelMode = 'normal' | 'rush' | 'lose' | 'blackout';

/** 勝ち確定時に下パネルが消灯（激熱演出）する確率 */
export const LOWER_PANEL_BLACKOUT_PROBABILITY = 0.2;

export interface TopLampLedInput {
  hasPosition: boolean;
  progress: number;
  sakibareActive: boolean;
  localPhase: SlotLocalPhase;
  hasPendingWin: boolean;
  hasPendingLose: boolean;
  isWinSettled: boolean;
  isLoseSettled: boolean;
}

export interface LowerPanelInput {
  isRush: boolean;
  localPhase: SlotLocalPhase;
  hasPendingWin: boolean;
  isBlackout: boolean;
  isWinSettled: boolean;
  isLoseSettled: boolean;
}

/**
 * 現在のトレード・スロット演出状態から上部ランプ左右LEDの発光パターンを判定する
 */
export function resolveTopLampLedMode(input: TopLampLedInput): TopLampLedMode {
  const {
    hasPosition,
    progress,
    sakibareActive,
    localPhase,
    hasPendingWin,
    hasPendingLose,
    isWinSettled,
    isLoseSettled,
  } = input;

  if (isWinSettled || localPhase === 'seven') {
    return 'win';
  }
  if (isLoseSettled || localPhase === 'skull') {
    return 'lose';
  }
  if (sakibareActive) {
    return 'sakibare';
  }
  if (
    hasPendingWin ||
    localPhase === 'mid_cherry' ||
    localPhase === 'reach_eye'
  ) {
    return 'gekiatsu';
  }
  if (hasPendingLose || localPhase === 'skull_omen') {
    return 'pinch';
  }
  if (!hasPosition) {
    return 'idle';
  }
  if (progress >= 80) {
    return 'gekiatsu';
  }
  if (progress >= 60) {
    return 'big_chance';
  }
  if (progress >= 30) {
    return 'chance';
  }
  if (progress <= -70) {
    return 'pinch';
  }
  return 'idle';
}

/**
 * 現在の状態から下パネルの表示演出モード（通常 / 点灯 / 暗め / 激熱消灯）を判定する
 */
export function resolveLowerPanelMode(input: LowerPanelInput): LowerPanelMode {
  const {
    isRush,
    localPhase,
    hasPendingWin,
    isBlackout,
    isWinSettled,
    isLoseSettled,
  } = input;

  if (
    isBlackout &&
    hasPendingWin &&
    localPhase !== 'seven' &&
    !isWinSettled &&
    !isLoseSettled
  ) {
    return 'blackout';
  }
  if (isWinSettled || localPhase === 'seven') {
    return 'rush';
  }
  if (isLoseSettled || localPhase === 'skull') {
    return 'lose';
  }
  if (isRush || localPhase === 'mid_cherry' || localPhase === 'reach_eye') {
    return 'rush';
  }
  return 'normal';
}

/**
 * 勝ち確定時の稀な下パネル消灯演出を抽選する
 */
export function rollLowerPanelBlackout(rng: () => number = Math.random): boolean {
  return rng() < LOWER_PANEL_BLACKOUT_PROBABILITY;
}
