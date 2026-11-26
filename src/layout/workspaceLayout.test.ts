import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRID_COLS,
  applyPanelTransform,
  getDefaultLayout,
  normalizeTopOffset,
  rectsOverlap,
  type PanelLayoutItem,
} from './workspaceLayout.ts';

function assertNoOverlaps(items: readonly PanelLayoutItem[]) {
  for (let i = 0; i < items.length; i++) {
    assert.ok(items[i].x >= 0);
    assert.ok(items[i].y >= 0);
    assert.ok(items[i].x + items[i].w <= GRID_COLS);
    assert.ok(items[i].w >= items[i].minW);
    assert.ok(items[i].h >= items[i].minH);
    for (let j = i + 1; j < items.length; j++) {
      assert.equal(rectsOverlap(items[i], items[j]), false);
    }
  }
}

test('slot / neon のデフォルト配置が 12 カラム内に収まり重複しない', () => {
  assertNoOverlaps(getDefaultLayout('slot'));
  assertNoOverlaps(getDefaultLayout('neon'));
});

test('右端のリールパネルを左端へ移動するとチャートが横スライドして左右が入れ替わる', () => {
  const base = getDefaultLayout('slot');
  const next = applyPanelTransform(base, 'slot', { x: 0, y: 0 });
  assertNoOverlaps(next);

  const slot = next.find((i) => i.id === 'slot')!;
  const chart = next.find((i) => i.id === 'chart')!;
  assert.equal(slot.x, 0);
  assert.equal(slot.y, 0);
  assert.equal(chart.x, slot.w);
  assert.equal(chart.y, 0);
});

test('リサイズ時に最小サイズ未満にならず 12 カラムを超えない', () => {
  const base = getDefaultLayout('slot');
  const shrunk = applyPanelTransform(base, 'chart', { w: 1, h: 2 });
  const chart = shrunk.find((i) => i.id === 'chart')!;
  assert.equal(chart.w, chart.minW);
  assert.equal(chart.h, chart.minH);

  const expanded = applyPanelTransform(base, 'chart', { w: 11, h: 12 });
  assertNoOverlaps(expanded);
  const expandedChart = expanded.find((i) => i.id === 'chart')!;
  assert.equal(expandedChart.w, 11);
});

test('注文窓を最上部へ移動しても連鎖衝突解決により全パネルが重複しない', () => {
  const base = getDefaultLayout('slot');
  const moved = applyPanelTransform(base, 'order', { x: 0, y: 0 });
  assertNoOverlaps(moved);

  const order = moved.find((i) => i.id === 'order')!;
  const chart = moved.find((i) => i.id === 'chart')!;
  const slot = moved.find((i) => i.id === 'slot')!;
  assert.equal(order.y, 0);
  assert.ok(chart.y >= order.y + order.h);
  // 右側スロット（x:7, w:5）は左側注文窓（w:7）と重ならないため y=0 を維持
  assert.equal(slot.y, 0);
});

test('normalizeTopOffset が上部の不要な空白を y=0 基点へ詰める', () => {
  const base = getDefaultLayout('neon').map((i) => ({ ...i, y: i.y + 4 }));
  const normalized = normalizeTopOffset(base);
  assert.equal(Math.min(...normalized.map((i) => i.y)), 0);
});
