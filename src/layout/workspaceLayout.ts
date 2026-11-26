import type { EffectPatternId } from '../game/effects.ts';

/** パネル識別子 */
export type PanelId = 'chart' | 'slot' | 'order';

/** 12カラムグリッド基本定数（1280×800のPC画面で1画面に収まる高さ設定） */
export const GRID_COLS = 12;
export const ROW_HEIGHT_PX = 34;
export const GRID_GAP_PX = 10;
export const MAX_ROWS = 40;

/** 1パネルのグリッド位置・サイズ定義 */
export interface PanelLayoutItem {
  id: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

interface StoredWorkspaceState {
  layouts?: Partial<Record<EffectPatternId, PanelLayoutItem[]>>;
  locked?: boolean;
}

const WORKSPACE_STORAGE_KEY = 'pachi-trade-workspace-layout-v2';

const PANEL_CONSTRAINTS: Record<PanelId, { minW: number; minH: number }> = {
  chart: { minW: 4, minH: 5 },
  slot: { minW: 3, minH: 7 },
  order: { minW: 4, minH: 4 },
};

/** 演出パターンごとの初期配置を返す（左約60%にチャート＋注文窓、右約40%にリール） */
export function getDefaultLayout(pattern: EffectPatternId): PanelLayoutItem[] {
  if (pattern === 'neon') {
    return [
      { id: 'chart', x: 0, y: 0, w: 12, h: 8, ...PANEL_CONSTRAINTS.chart },
      { id: 'order', x: 0, y: 8, w: 12, h: 5, ...PANEL_CONSTRAINTS.order },
    ];
  }

  return [
    { id: 'chart', x: 0, y: 0, w: 7, h: 8, ...PANEL_CONSTRAINTS.chart },
    { id: 'order', x: 0, y: 8, w: 7, h: 5, ...PANEL_CONSTRAINTS.order },
    { id: 'slot', x: 7, y: 0, w: 5, h: 13, ...PANEL_CONSTRAINTS.slot },
  ];
}

/** 2つのグリッド矩形が重なっているか判定 */
export function rectsOverlap(a: PanelLayoutItem, b: PanelLayoutItem): boolean {
  if (a.id === b.id) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** パネルの位置・サイズをグリッド制約内に丸め・クランプする */
export function clampPanelRect(
  item: PanelLayoutItem,
  next: Partial<Pick<PanelLayoutItem, 'x' | 'y' | 'w' | 'h'>>,
): PanelLayoutItem {
  const minW = Math.min(GRID_COLS, Math.max(1, item.minW));
  const minH = Math.max(1, item.minH);

  const rawW = next.w ?? item.w;
  const rawH = next.h ?? item.h;
  const w = Math.max(minW, Math.min(GRID_COLS, Math.round(rawW)));
  const h = Math.max(minH, Math.min(MAX_ROWS, Math.round(rawH)));

  const rawX = next.x ?? item.x;
  const rawY = next.y ?? item.y;
  const x = Math.max(0, Math.min(GRID_COLS - w, Math.round(rawX)));
  const y = Math.max(0, Math.min(MAX_ROWS - h, Math.round(rawY)));

  return {
    ...item,
    x,
    y,
    w,
    h,
  };
}

/** 指定パネルの配置が既存リストのいずれかと重なるか */
function overlapsAny(
  candidate: PanelLayoutItem,
  others: readonly PanelLayoutItem[],
): boolean {
  return others.some((o) => rectsOverlap(candidate, o));
}

/**
 * 指定パネル（activeId）を移動・リサイズし、他パネルとの衝突を解決する
 * activeId の位置は維持し、重なったパネルは横スライド優先→縦押し出しで避けさせる。
 */
export function applyPanelTransform(
  baseItems: readonly PanelLayoutItem[],
  activeId: PanelId,
  next: Partial<Pick<PanelLayoutItem, 'x' | 'y' | 'w' | 'h'>>,
): PanelLayoutItem[] {
  const items = baseItems.map((item) => ({ ...item }));
  const activeIdx = items.findIndex((i) => i.id === activeId);
  if (activeIdx === -1) return items;

  const active = clampPanelRect(items[activeIdx], next);
  items[activeIdx] = active;

  // 衝突解決: active を固定し、それ以外を上から順に非重複位置へ寄せる
  const others = items
    .filter((i) => i.id !== activeId)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const placed: PanelLayoutItem[] = [active];

  for (const rawOther of others) {
    let candidate = { ...rawOther };

    if (overlapsAny(candidate, placed)) {
      const blockers = placed.filter((p) => rectsOverlap(candidate, p));
      const primaryBlocker = blockers[0];

      // 1. 横スライド（右→左）で収まるか試す
      const rightCandidate = clampPanelRect(candidate, {
        x: primaryBlocker.x + primaryBlocker.w,
        y: candidate.y,
      });
      const leftCandidate = clampPanelRect(candidate, {
        x: primaryBlocker.x - candidate.w,
        y: candidate.y,
      });

      if (
        primaryBlocker.x + primaryBlocker.w + candidate.w <= GRID_COLS &&
        !overlapsAny(rightCandidate, placed)
      ) {
        candidate = rightCandidate;
      } else if (
        primaryBlocker.x - candidate.w >= 0 &&
        !overlapsAny(leftCandidate, placed)
      ) {
        candidate = leftCandidate;
      } else {
        // 2. 横に収まらない場合は縦方向（衝突対象の直下）へ押し出す
        let guard = 0;
        while (overlapsAny(candidate, placed) && guard < MAX_ROWS) {
          const hit = placed.find((p) => rectsOverlap(candidate, p));
          if (!hit) break;
          candidate = {
            ...candidate,
            y: hit.y + hit.h,
          };
          guard += 1;
        }
      }
    }

    placed.push(candidate);
  }

  // 元の配列順を保って返す
  return baseItems.map(
    (orig) => placed.find((p) => p.id === orig.id) ?? orig,
  );
}

/**
 * 全パネルの上端余白（最小 y > 0）を 0 基点へ詰める
 */
export function normalizeTopOffset(
  items: readonly PanelLayoutItem[],
): PanelLayoutItem[] {
  if (items.length === 0) return [];
  const minY = Math.min(...items.map((i) => i.y));
  if (minY <= 0) return items.map((i) => ({ ...i }));
  return items.map((i) => ({ ...i, y: i.y - minY }));
}

/** 現在のレイアウトが占める総行数を返す */
export function computeTotalRows(items: readonly PanelLayoutItem[]): number {
  if (items.length === 0) return 12;
  return Math.max(12, ...items.map((i) => i.y + i.h));
}

function readStoredState(): StoredWorkspaceState {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredWorkspaceState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredState(state: StoredWorkspaceState): void {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // プライベートブラウジング等の書き込み制限は無視
  }
}

/** localStorage から演出パターンに対応するレイアウトを読み込む */
export function loadWorkspaceLayout(
  pattern: EffectPatternId,
): PanelLayoutItem[] {
  const defaults = getDefaultLayout(pattern);
  const requiredIds = new Set(defaults.map((d) => d.id));
  const stored = readStoredState().layouts?.[pattern];
  if (!Array.isArray(stored) || stored.length !== defaults.length) {
    return defaults;
  }

  const normalized: PanelLayoutItem[] = [];
  const seen = new Set<PanelId>();

  for (const raw of stored) {
    if (!raw || typeof raw !== 'object' || !requiredIds.has(raw.id) || seen.has(raw.id)) {
      return defaults;
    }
    if (
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y) ||
      !Number.isFinite(raw.w) ||
      !Number.isFinite(raw.h)
    ) {
      return defaults;
    }
    seen.add(raw.id);
    const constraints = PANEL_CONSTRAINTS[raw.id];
    normalized.push(
      clampPanelRect(
        { id: raw.id, x: 0, y: 0, w: raw.w, h: raw.h, ...constraints },
        { x: raw.x, y: raw.y, w: raw.w, h: raw.h },
      ),
    );
  }

  // 保存データが重なっていた場合は初期配置にフォールバック
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (rectsOverlap(normalized[i], normalized[j])) {
        return defaults;
      }
    }
  }

  return normalized;
}

/** 演出パターンに対応するレイアウトを localStorage へ保存する */
export function saveWorkspaceLayout(
  pattern: EffectPatternId,
  items: readonly PanelLayoutItem[],
): void {
  const current = readStoredState();
  writeStoredState({
    ...current,
    layouts: {
      ...(current.layouts ?? {}),
      [pattern]: items.map((i) => ({ ...i })),
    },
  });
}

/** レイアウトロック状態を読み込む（初期値は編集可能 false） */
export function loadWorkspaceLocked(): boolean {
  return Boolean(readStoredState().locked);
}

/** レイアウトロック状態を保存する */
export function saveWorkspaceLocked(locked: boolean): void {
  const current = readStoredState();
  writeStoredState({
    ...current,
    locked,
  });
}
