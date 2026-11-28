import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  GRID_COLS,
  GRID_GAP_PX,
  ROW_HEIGHT_PX,
  applyPanelTransform,
  computeTotalRows,
  normalizeTopOffset,
  type PanelId,
  type PanelLayoutItem,
} from '../layout/workspaceLayout.ts';
import { GripVerticalIcon } from './Icons.tsx';

export interface PanelRenderMeta {
  title: string;
  accentClass?: string;
  content: ReactNode;
}

interface WorkspaceGridProps {
  items: PanelLayoutItem[];
  locked: boolean;
  onChangeItems: (next: PanelLayoutItem[]) => void;
  onCommitItems: (next: PanelLayoutItem[]) => void;
  renderPanel: (id: PanelId) => PanelRenderMeta;
}

type InteractionKind = 'drag' | 'resize-e' | 'resize-s' | 'resize-se';

interface ActiveInteraction {
  kind: InteractionKind;
  activeId: PanelId;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  baseItems: PanelLayoutItem[];
  originItem: PanelLayoutItem;
  colStep: number;
  rowStep: number;
}

/**
 * トレーディングツール風の自由移動・自由リサイズ可能な12カラムワークスペース
 */
export function WorkspaceGrid({
  items,
  locked,
  onChangeItems,
  onCommitItems,
  renderPanel,
}: WorkspaceGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);
  const [interaction, setInteraction] = useState<ActiveInteraction | null>(null);

  const interactionRef = useRef<ActiveInteraction | null>(null);
  const latestItemsRef = useRef<PanelLayoutItem[]>(items);
  const onChangeItemsRef = useRef(onChangeItems);
  const onCommitItemsRef = useRef(onCommitItems);

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  useEffect(() => {
    onChangeItemsRef.current = onChangeItems;
  }, [onChangeItems]);

  useEffect(() => {
    onCommitItemsRef.current = onCommitItems;
  }, [onCommitItems]);

  // コンテナ幅の監視（モバイルスタック切替・グリッド幅計算）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();

    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        setContainerWidth(w);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // ドラッグ／リサイズ中のグローバルポインタ追跡
  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (e: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) return;

      const dx = e.clientX - current.startX;
      const dy = e.clientY - current.startY;
      const updatedInteraction: ActiveInteraction = { ...current, dx, dy };
      interactionRef.current = updatedInteraction;
      setInteraction(updatedInteraction);

      const deltaCols = Math.round(dx / current.colStep);
      const deltaRows = Math.round(dy / current.rowStep);

      let nextTransform: Partial<Pick<PanelLayoutItem, 'x' | 'y' | 'w' | 'h'>> =
        {};
      if (current.kind === 'drag') {
        nextTransform = {
          x: current.originItem.x + deltaCols,
          y: current.originItem.y + deltaRows,
        };
      } else if (current.kind === 'resize-e') {
        nextTransform = {
          w: current.originItem.w + deltaCols,
        };
      } else if (current.kind === 'resize-s') {
        nextTransform = {
          h: current.originItem.h + deltaRows,
        };
      } else {
        nextTransform = {
          w: current.originItem.w + deltaCols,
          h: current.originItem.h + deltaRows,
        };
      }

      const nextItems = applyPanelTransform(
        current.baseItems,
        current.activeId,
        nextTransform,
      );
      latestItemsRef.current = nextItems;
      onChangeItemsRef.current(nextItems);
    };

    const finishInteraction = () => {
      const current = interactionRef.current;
      if (!current) return;

      interactionRef.current = null;
      setInteraction(null);

      const finalized = normalizeTopOffset(latestItemsRef.current);
      latestItemsRef.current = finalized;
      onCommitItemsRef.current(finalized);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', finishInteraction);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishInteraction);
      window.removeEventListener('pointercancel', finishInteraction);
    };
  }, [Boolean(interaction)]);

  const isStacked = containerWidth < 768;
  const colStep = (containerWidth + GRID_GAP_PX) / GRID_COLS;
  const rowStep = ROW_HEIGHT_PX + GRID_GAP_PX;
  const totalRows = computeTotalRows(items);
  const canvasHeight = totalRows * rowStep - GRID_GAP_PX;

  const startInteraction = (
    e: React.PointerEvent,
    kind: InteractionKind,
    item: PanelLayoutItem,
  ) => {
    if (locked || isStacked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const snapshot = items.map((i) => ({ ...i }));
    const nextInteraction: ActiveInteraction = {
      kind,
      activeId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      baseItems: snapshot,
      originItem: { ...item },
      colStep,
      rowStep,
    };

    interactionRef.current = nextInteraction;
    setInteraction(nextInteraction);
  };

  // モバイル等の狭い画面では縦積みフォールバック
  if (isStacked) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
      <div ref={containerRef} className="flex w-full flex-col gap-3">
        {sorted.map((item) => {
          const meta = renderPanel(item.id);
          return (
            <div
              key={item.id}
              data-testid={`workspace-panel-${item.id}`}
              className={`flex flex-col overflow-hidden rounded-2xl border bg-[#070b14] shadow-[0_0_24px_rgba(15,23,42,0.85)] ${
                meta.accentClass ?? 'border-slate-700/80'
              } ${item.id === 'chart' ? 'min-h-[380px]' : ''} ${
                item.id === 'slot' ? 'min-h-[360px]' : ''
              }`}
            >
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0b1120] px-3">
                <span className="text-[11px] font-bold tracking-wider text-slate-300">
                  {meta.title}
                </span>
                <span className="text-[10px] text-slate-500">モバイル表示</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">{meta.content}</div>
            </div>
          );
        })}
      </div>
    );
  }

  const activePlaceholder = interaction
    ? items.find((i) => i.id === interaction.activeId) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      style={{ height: `${canvasHeight}px` }}
      className={`relative w-full transition-[height] duration-150 ${
        interaction ? 'select-none' : ''
      }`}
    >
      {/* ドラッグ／リサイズ時の着地プレビュー枠（スナップ先） */}
      {activePlaceholder && (
        <div
          aria-hidden="true"
          style={{
            left: `${activePlaceholder.x * colStep}px`,
            top: `${activePlaceholder.y * rowStep}px`,
            width: `${activePlaceholder.w * colStep - GRID_GAP_PX}px`,
            height: `${activePlaceholder.h * rowStep - GRID_GAP_PX}px`,
          }}
          className="pointer-events-none absolute z-10 rounded-2xl border-2 border-dashed border-cyan-400/70 bg-cyan-400/10 transition-all duration-75"
        />
      )}

      {items.map((item) => {
        const meta = renderPanel(item.id);
        const isActive = interaction?.activeId === item.id;

        let left = item.x * colStep;
        let top = item.y * rowStep;
        let width = item.w * colStep - GRID_GAP_PX;
        let height = item.h * rowStep - GRID_GAP_PX;

        if (isActive && interaction) {
          const originLeft = interaction.originItem.x * colStep;
          const originTop = interaction.originItem.y * rowStep;
          const originWidth = interaction.originItem.w * colStep - GRID_GAP_PX;
          const originHeight = interaction.originItem.h * rowStep - GRID_GAP_PX;
          const minWidthPx = interaction.originItem.minW * colStep - GRID_GAP_PX;
          const minHeightPx = interaction.originItem.minH * rowStep - GRID_GAP_PX;

          if (interaction.kind === 'drag') {
            left = Math.max(
              0,
              Math.min(containerWidth - originWidth, originLeft + interaction.dx),
            );
            top = Math.max(0, originTop + interaction.dy);
            width = originWidth;
            height = originHeight;
          } else {
            left = originLeft;
            top = originTop;
            if (
              interaction.kind === 'resize-e' ||
              interaction.kind === 'resize-se'
            ) {
              width = Math.max(
                minWidthPx,
                Math.min(containerWidth - originLeft, originWidth + interaction.dx),
              );
            } else {
              width = originWidth;
            }
            if (
              interaction.kind === 'resize-s' ||
              interaction.kind === 'resize-se'
            ) {
              height = Math.max(minHeightPx, originHeight + interaction.dy);
            } else {
              height = originHeight;
            }
          }
        }

        return (
          <div
            key={item.id}
            data-testid={`workspace-panel-${item.id}`}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            }}
            className={`absolute flex flex-col overflow-hidden rounded-2xl border bg-[#070b14] ${
              meta.accentClass ?? 'border-slate-700/80'
            } ${
              isActive
                ? 'z-30 ring-2 ring-cyan-400/75 shadow-[0_12px_40px_rgba(6,182,212,0.28)]'
                : 'z-20 shadow-[0_0_24px_rgba(15,23,42,0.85)] transition-[left,top,width,height] duration-150 ease-out'
            }`}
          >
            {/* パネル上部ドラッグハンドルバー */}
            <div
              data-testid={`panel-drag-handle-${item.id}`}
              onPointerDown={(e) => startInteraction(e, 'drag', item)}
              title={
                locked
                  ? 'レイアウト固定中（編集ロック解除で移動できます）'
                  : 'ドラッグしてパネルを移動'
              }
              className={`flex h-8 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0b1120] px-2.5 ${
                locked
                  ? 'cursor-default'
                  : isActive && interaction?.kind === 'drag'
                    ? 'cursor-grabbing bg-cyan-950/50'
                    : 'cursor-grab hover:bg-[#111a31]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {!locked && (
                  <GripVerticalIcon className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span className="text-[11px] font-bold tracking-wider text-slate-200">
                  {meta.title}
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-500">
                {locked ? 'FIXED' : `${item.w}×${item.h}`}
              </span>
            </div>

            {/* パネル中身 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {meta.content}
            </div>

            {/* リサイズハンドル（編集ロック解除中のみ表示） */}
            {!locked && (
              <>
                <div
                  aria-hidden="true"
                  onPointerDown={(e) => startInteraction(e, 'resize-e', item)}
                  className="absolute top-8 right-0 bottom-3 z-30 w-2 cursor-ew-resize transition-colors hover:bg-cyan-400/30"
                />
                <div
                  aria-hidden="true"
                  onPointerDown={(e) => startInteraction(e, 'resize-s', item)}
                  className="absolute right-3 bottom-0 left-3 z-30 h-2 cursor-ns-resize transition-colors hover:bg-cyan-400/30"
                />
                <div
                  data-testid={`panel-resize-handle-${item.id}`}
                  title="ドラッグしてサイズ変更"
                  onPointerDown={(e) => startInteraction(e, 'resize-se', item)}
                  className="absolute right-0 bottom-0 z-40 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-1 text-slate-400 transition-colors hover:text-cyan-300"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3">
                    <path
                      d="M11 3L3 11M11 7L7 11"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
