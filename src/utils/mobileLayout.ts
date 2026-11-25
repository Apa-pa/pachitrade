import type { EffectPatternId } from '../game/effects.ts';

export type MobileNavTab = 'trade' | 'chart' | 'stats';
export type MobileFocusMode = 'chart' | 'slot';

export interface MobileStageInput {
  effectPattern: EffectPatternId;
  focusMode: MobileFocusMode;
  navTab: MobileNavTab;
  hasPosition: boolean;
  hasPendingSettlement: boolean;
  hasSettlement: boolean;
}

export interface MobileStageState {
  effectiveFocus: MobileFocusMode;
  isSettlingOrSettled: boolean;
  showSlotMiniBar: boolean;
  showStageToggle: boolean;
}

/**
 * スマホ画面のステージ表示状態（スロットメイン／チャート拡大／ミニスロットバー／切替ボタン表示）を算出する。
 * 決着演出中および決着オーバーレイ表示中は、スロット演出選択時であれば無条件でスロットメインへ復帰させる。
 */
export function resolveMobileStageState(
  input: MobileStageInput,
): MobileStageState {
  const isSettlingOrSettled = input.hasPendingSettlement || input.hasSettlement;

  if (input.effectPattern === 'neon') {
    return {
      effectiveFocus: 'chart',
      isSettlingOrSettled,
      showSlotMiniBar: false,
      showStageToggle: input.navTab !== 'chart' && !isSettlingOrSettled,
    };
  }

  if (isSettlingOrSettled) {
    return {
      effectiveFocus: 'slot',
      isSettlingOrSettled: true,
      showSlotMiniBar: false,
      showStageToggle: false,
    };
  }

  if (input.navTab === 'chart') {
    return {
      effectiveFocus: 'chart',
      isSettlingOrSettled: false,
      showSlotMiniBar: false,
      showStageToggle: false,
    };
  }

  return {
    effectiveFocus: input.focusMode,
    isSettlingOrSettled: false,
    showSlotMiniBar: input.focusMode === 'chart' && input.hasPosition,
    showStageToggle: true,
  };
}
