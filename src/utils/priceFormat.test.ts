import assert from 'node:assert/strict';
import test from 'node:test';
import { formatIntervalLabel, splitHighlightPrice } from './priceFormat.ts';

test('splitHighlightPrice は整数下2桁を big へ正しく分割する', () => {
  assert.deepEqual(splitHighlightPrice(90123.45, 2), {
    head: '90,1',
    big: '23',
    tail: '.45',
  });

  assert.deepEqual(splitHighlightPrice(151.67, 2), {
    head: '1',
    big: '51',
    tail: '.67',
  });

  assert.deepEqual(splitHighlightPrice(1005.0, 2), {
    head: '1,0',
    big: '05',
    tail: '.00',
  });

  assert.deepEqual(splitHighlightPrice(5.25, 2), {
    head: '',
    big: '5',
    tail: '.25',
  });

  assert.deepEqual(splitHighlightPrice(null, 2), {
    head: '---',
    big: '--',
    tail: '',
  });
});

test('formatIntervalLabel は秒足と分足を正しくフォーマットする', () => {
  assert.equal(formatIntervalLabel(5), '5秒足');
  assert.equal(formatIntervalLabel(60), '1分足');
  assert.equal(formatIntervalLabel(300), '5分足');
});
