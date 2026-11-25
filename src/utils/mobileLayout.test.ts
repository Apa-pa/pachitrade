import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMobileStageState } from './mobileLayout.ts';

test('待機中は focusMode=chart でチャートメインとなりミニバーは出ない', () => {
  const res = resolveMobileStageState({
    effectPattern: 'slot',
    focusMode: 'chart',
    navTab: 'trade',
    hasPosition: false,
    hasPendingSettlement: false,
    hasSettlement: false,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'chart',
    isSettlingOrSettled: false,
    showSlotMiniBar: false,
    showStageToggle: true,
  });
});

test('保有中かつチャート拡大時はミニスロットバーを表示する', () => {
  const res = resolveMobileStageState({
    effectPattern: 'slot',
    focusMode: 'chart',
    navTab: 'trade',
    hasPosition: true,
    hasPendingSettlement: false,
    hasSettlement: false,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'chart',
    isSettlingOrSettled: false,
    showSlotMiniBar: true,
    showStageToggle: true,
  });
});

test('チャート拡大中に決着演出へ入ったら無条件でスロットメインへ自動復帰する', () => {
  const res = resolveMobileStageState({
    effectPattern: 'slot',
    focusMode: 'chart',
    navTab: 'trade',
    hasPosition: false,
    hasPendingSettlement: true,
    hasSettlement: false,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'slot',
    isSettlingOrSettled: true,
    showSlotMiniBar: false,
    showStageToggle: false,
  });
});

test('チャートタブ表示中に決着演出へ入った場合もスロットメインへ復帰する', () => {
  const res = resolveMobileStageState({
    effectPattern: 'slot',
    focusMode: 'chart',
    navTab: 'chart',
    hasPosition: false,
    hasPendingSettlement: true,
    hasSettlement: false,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'slot',
    isSettlingOrSettled: true,
    showSlotMiniBar: false,
    showStageToggle: false,
  });
});

test('決着結果ダイアログ表示中もスロットメインを維持する', () => {
  const res = resolveMobileStageState({
    effectPattern: 'slot',
    focusMode: 'chart',
    navTab: 'trade',
    hasPosition: false,
    hasPendingSettlement: false,
    hasSettlement: true,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'slot',
    isSettlingOrSettled: true,
    showSlotMiniBar: false,
    showStageToggle: false,
  });
});

test('ネオン演出時は決着中もチャートメインを維持し切替ボタンを隠す', () => {
  const res = resolveMobileStageState({
    effectPattern: 'neon',
    focusMode: 'slot',
    navTab: 'trade',
    hasPosition: false,
    hasPendingSettlement: false,
    hasSettlement: true,
  });

  assert.deepEqual(res, {
    effectiveFocus: 'chart',
    isSettlingOrSettled: true,
    showSlotMiniBar: false,
    showStageToggle: false,
  });
});
