/** 選択可能な演出パターンの識別子（将来パターン追加時はここにIDを追加） */
export type EffectPatternId = 'slot' | 'neon';

/** 演出パターンのメタ情報 */
export interface EffectPatternMeta {
  id: EffectPatternId;
  label: string;
  shortLabel: string;
  description: string;
}

/** 選択可能な演出パターン一覧レジストリ */
export const EFFECT_PATTERNS: readonly EffectPatternMeta[] = [
  {
    id: 'slot',
    label: 'スロット出目演出',
    shortLabel: 'スロット出目',
    description: '3リールが回転し、値動きの勢いで小役・リプレイ・777揃いを告知',
  },
  {
    id: 'neon',
    label: 'ネオン＆カットイン演出',
    shortLabel: 'ネオン演出',
    description:
      '進捗率に応じた画面外枠ネオン発光・激アツカットイン・シェイク演出',
  },
] as const;

const EFFECT_PATTERN_STORAGE_KEY = 'pachi-trade-effect-pattern-v1';

/** localStorage から選択中の演出パターンを読み込む（初期値は 'slot'） */
export function loadEffectPattern(): EffectPatternId {
  try {
    const raw = window.localStorage.getItem(EFFECT_PATTERN_STORAGE_KEY);
    if (raw === 'slot' || raw === 'neon') {
      return raw;
    }
    return 'slot';
  } catch {
    return 'slot';
  }
}

/** 選択中の演出パターンを localStorage へ保存する */
export function saveEffectPattern(pattern: EffectPatternId): void {
  try {
    window.localStorage.setItem(EFFECT_PATTERN_STORAGE_KEY, pattern);
  } catch {
    // プライベートブラウジング等の容量制限エラーは無視
  }
}
