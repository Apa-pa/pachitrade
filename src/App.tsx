import { useCallback, useEffect, useState } from 'react';
import { ConnectionBanner } from './components/ConnectionBanner.tsx';
import { ControlPanel } from './components/ControlPanel.tsx';
import { EffectSelector } from './components/EffectSelector.tsx';
import { HeaderBar } from './components/HeaderBar.tsx';
import { PachiOverlay } from './components/PachiOverlay.tsx';
import { PriceChart } from './components/PriceChart.tsx';
import { SlotReelPanel } from './components/SlotReelPanel.tsx';
import { WorkspaceGrid, type PanelRenderMeta } from './components/WorkspaceGrid.tsx';
import { usePachiTradeGame } from './game/usePachiTradeGame.ts';
import {
  getDefaultLayout,
  loadWorkspaceLayout,
  loadWorkspaceLocked,
  saveWorkspaceLayout,
  saveWorkspaceLocked,
  type PanelId,
  type PanelLayoutItem,
} from './layout/workspaceLayout.ts';

export function App() {
  const {
    mode,
    status,
    statusMessage,
    meta,
    initialCandles,
    candlesRevision,
    latestCandle,
    currentPrice,
    prevPrice,
    targetWidth,
    setTargetWidth,
    position,
    progress,
    progressDelta,
    currentPnl,
    effectPattern,
    effectStage,
    sakibareActive,
    pendingWinSettlement,
    midCherryActive,
    sevenAligned,
    pendingLoseSettlement,
    skullAligned,
    settlement,
    stats,
    muted,
    enterPosition,
    notifyMidCherryHit,
    notifySevenAligned,
    completePendingWin,
    notifySkullAligned,
    completePendingLose,
    changeEffectPattern,
    dismissSettlement,
    switchMode,
    retryConnection,
    toggleMute,
    resetStats,
  } = usePachiTradeGame();

  const [layoutItems, setLayoutItems] = useState<PanelLayoutItem[]>(() =>
    loadWorkspaceLayout(effectPattern),
  );
  const [layoutLocked, setLayoutLocked] = useState<boolean>(() =>
    loadWorkspaceLocked(),
  );

  // 演出パターン切り替え時に、該当パターン用に保存された配置を同期ロードしてチラつきを防ぐ
  const handleSelectPattern = useCallback(
    (next: Parameters<typeof changeEffectPattern>[0]) => {
      setLayoutItems(loadWorkspaceLayout(next));
      changeEffectPattern(next);
    },
    [changeEffectPattern],
  );

  useEffect(() => {
    setLayoutItems(loadWorkspaceLayout(effectPattern));
  }, [effectPattern]);

  const handleCommitLayout = useCallback(
    (next: PanelLayoutItem[]) => {
      setLayoutItems(next);
      saveWorkspaceLayout(effectPattern, next);
    },
    [effectPattern],
  );

  const handleToggleLock = useCallback(() => {
    setLayoutLocked((prev) => {
      const next = !prev;
      saveWorkspaceLocked(next);
      return next;
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    const defaults = getDefaultLayout(effectPattern);
    setLayoutItems(defaults);
    saveWorkspaceLayout(effectPattern, defaults);
  }, [effectPattern]);

  const renderPanel = useCallback(
    (id: PanelId): PanelRenderMeta => {
      switch (id) {
        case 'chart':
          return {
            title: '📈 相場チャート',
            accentClass: 'border-cyan-500/30',
            content: (
              <PriceChart
                initialCandles={initialCandles}
                candlesRevision={candlesRevision}
                latestCandle={latestCandle}
                currentPrice={currentPrice}
                prevPrice={prevPrice}
                meta={meta}
                position={position}
              />
            ),
          };
        case 'slot':
          return {
            title: '🎰 出目リール',
            accentClass: pendingWinSettlement
              ? 'border-yellow-300/90'
              : pendingLoseSettlement
                ? 'border-purple-400/90'
                : 'border-amber-500/35',
            content: (
              <SlotReelPanel
                position={position}
                progress={progress}
                progressDelta={progressDelta}
                pendingWinSettlement={pendingWinSettlement}
                pendingLoseSettlement={pendingLoseSettlement}
                settlement={settlement}
                onMidCherryActiveChange={notifyMidCherryHit}
                onSevenAligned={notifySevenAligned}
                onCompletePendingWin={completePendingWin}
                onSkullAligned={notifySkullAligned}
                onCompletePendingLose={completePendingLose}
              />
            ),
          };
        case 'order':
          return {
            title: '🎛️ 注文窓・進捗メーター',
            accentClass: 'border-slate-700/80',
            content: (
              <ControlPanel
                meta={meta}
                currentPrice={currentPrice}
                targetWidth={targetWidth}
                position={position}
                progress={progress}
                currentPnl={currentPnl}
                effectStage={effectStage}
                hasSettlement={settlement !== null}
                isCelebratingWin={pendingWinSettlement !== null}
                isMidCherryPhase={midCherryActive}
                isSevenAligned={sevenAligned}
                isCelebratingLose={pendingLoseSettlement !== null}
                isSkullAligned={skullAligned}
                onChangeTargetWidth={setTargetWidth}
                onEnter={enterPosition}
              />
            ),
          };
      }
    },
    [
      initialCandles,
      candlesRevision,
      latestCandle,
      currentPrice,
      prevPrice,
      meta,
      position,
      progress,
      progressDelta,
      pendingWinSettlement,
      midCherryActive,
      sevenAligned,
      pendingLoseSettlement,
      skullAligned,
      settlement,
      notifyMidCherryHit,
      notifySevenAligned,
      completePendingWin,
      notifySkullAligned,
      completePendingLose,
      targetWidth,
      currentPnl,
      effectStage,
      setTargetWidth,
      enterPosition,
    ],
  );

  const isShaking =
    effectPattern === 'neon' && !settlement && effectStage === 'gekiatsu';
  const isLoseFade = settlement?.outcome === 'LOSE';

  return (
    <div className="relative min-h-screen bg-[#06080f] text-slate-100">
      {/* サイバー・パチスロ背景の微妙なラジアルグロウ */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(6,182,212,0.12),transparent_42%),radial-gradient(circle_at_85%_85%,rgba(217,70,239,0.1),transparent_42%)]"
      />

      {/* メイン筐体コンテナ（ネオン演出+80%でシェイク、LOSE決着でモノクロフェード） */}
      <div
        className={`relative z-10 flex min-h-screen flex-col transition-all duration-500 ${
          isShaking ? 'animate-pachi-shake' : ''
        } ${isLoseFade ? 'grayscale brightness-75' : ''}`}
      >
        <HeaderBar
          mode={mode}
          status={status}
          meta={meta}
          stats={stats}
          muted={muted}
          hasPosition={position !== null}
          onSwitchMode={switchMode}
          onToggleMute={toggleMute}
          onResetStats={resetStats}
        />

        <ConnectionBanner
          mode={mode}
          status={status}
          message={statusMessage}
          onSwitchToDemo={() => switchMode('demo')}
          onRetry={retryConnection}
        />

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 px-3 py-3 sm:px-5">
          <EffectSelector
            selectedPattern={effectPattern}
            locked={layoutLocked}
            onSelectPattern={handleSelectPattern}
            onToggleLock={handleToggleLock}
            onResetLayout={handleResetLayout}
          />

          <WorkspaceGrid
            items={
              effectPattern === 'neon'
                ? layoutItems.filter((item) => item.id !== 'slot')
                : layoutItems
            }
            locked={layoutLocked}
            onChangeItems={setLayoutItems}
            onCommitItems={handleCommitLayout}
            renderPanel={renderPanel}
          />
        </main>

        <footer className="border-t border-slate-800/70 bg-[#05070d]/90 px-4 py-2.5 text-center text-[11px] text-slate-400">
          ※本アプリはエンターテインメントおよびトレード練習用のシミュレーションツールです。投資助言を目的としたものではありません。
        </footer>
      </div>

      {/* 画面外枠ネオン・先バレフラッシュ・BONUS確定・決着オーバーレイ */}
      <PachiOverlay
        effectPattern={effectPattern}
        effectStage={effectStage}
        midCherryActive={midCherryActive}
        sevenAligned={sevenAligned}
        skullAligned={skullAligned}
        pendingWinOutcome={pendingWinSettlement?.outcome ?? null}
        sakibareActive={sakibareActive}
        settlement={settlement}
        meta={meta}
        onDismissSettlement={dismissSettlement}
      />
    </div>
  );
}

export default App;
