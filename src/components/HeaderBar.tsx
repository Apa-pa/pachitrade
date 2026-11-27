import type { FeedMode, FeedStatus, InstrumentMeta } from '../feeds/index.ts';
import {
  getCompletionRate,
  getUnsettledCount,
  getWinRate,
  isWinningStreak,
} from '../game/engine.ts';
import type { GameStats } from '../game/types.ts';
import {
  FlameIcon,
  RotateCcwIcon,
  ShareIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from './Icons.tsx';

interface HeaderBarProps {
  mode: FeedMode;
  status: FeedStatus;
  meta: InstrumentMeta;
  stats: GameStats;
  muted: boolean;
  hasPosition: boolean;
  onSwitchMode: (mode: FeedMode) => void;
  onToggleMute: () => void;
  onResetStats: () => void;
  onOpenStats: () => void;
}

/** ステータスインジケータ表示 */
function getStatusBadge(mode: FeedMode, status: FeedStatus) {
  if (mode === 'demo' && status === 'connected') {
    return {
      label: 'DEMO 高速生成',
      dotClass: 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]',
      textClass: 'text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-950/40',
    };
  }
  switch (status) {
    case 'connected':
      return {
        label: 'LIVE 接続中',
        dotClass: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
        textClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40',
      };
    case 'connecting':
    case 'reconnecting':
      return {
        label: status === 'reconnecting' ? '再接続中...' : '接続中...',
        dotClass: 'bg-amber-400 animate-pulse',
        textClass: 'text-amber-300 border-amber-500/40 bg-amber-950/40',
      };
    case 'error':
      return {
        label: '接続エラー',
        dotClass: 'bg-rose-500',
        textClass: 'text-rose-300 border-rose-500/50 bg-rose-950/50',
      };
    default:
      return {
        label: '待機中',
        dotClass: 'bg-slate-400',
        textClass: 'text-slate-300 border-slate-600/40 bg-slate-900/60',
      };
  }
}

export function HeaderBar({
  mode,
  status,
  meta,
  stats,
  muted,
  hasPosition,
  onSwitchMode,
  onToggleMute,
  onResetStats,
  onOpenStats,
}: HeaderBarProps) {
  const isStreak = isWinningStreak(stats);
  const winRate = getWinRate(stats);
  const totalGames = stats.wins + stats.losses;
  const completionRate = getCompletionRate(stats);
  const unsettledCount = getUnsettledCount(stats);
  const completionColorClass =
    stats.totalEntries === 0
      ? 'text-slate-400'
      : completionRate >= 90
        ? 'text-cyan-300'
        : completionRate >= 70
          ? 'text-amber-300'
          : 'text-rose-400';
  const badge = getStatusBadge(mode, status);

  return (
    <header className="relative z-20 border-b border-cyan-500/20 bg-[#090d18]/95 px-3 py-1.5 backdrop-blur-md sm:px-5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        {/* 左ブロック: タイトル・モード切替・ステータス */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-500 px-2 py-0.5 text-xs font-black tracking-wider text-white shadow-[0_0_12px_rgba(244,63,94,0.6)]">
              777
            </span>
            <div>
              <h1 className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-400 bg-clip-text text-base font-black tracking-wider text-transparent sm:text-lg">
                PACHI-TRADE
              </h1>
              <p className="text-[10px] font-medium tracking-wide text-slate-400">
                {meta.symbol} チャートバトル
              </p>
            </div>
          </div>

          {/* REALTIME / DEMO モード切替 */}
          <div
            className="flex items-center rounded-lg border border-slate-700/80 bg-[#05070e] p-0.5"
            role="group"
            aria-label="データソース切り替え"
          >
            <button
              type="button"
              onClick={() => onSwitchMode('realtime')}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                mode === 'realtime'
                  ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={
                hasPosition
                  ? '切り替えると保有中ポジションは未決着として解除されます'
                  : 'Binance リアルタイム相場へ切り替え'
              }
            >
              REALTIME
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('demo')}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                mode === 'demo'
                  ? 'bg-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.35)] ring-1 ring-fuchsia-400/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={
                hasPosition
                  ? '切り替えると保有中ポジションは未決着として解除されます'
                  : '高速ランダムウォーク DEMO モードへ切り替え'
              }
            >
              DEMO
            </button>
          </div>

          {/* 接続ステータス */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.textClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${badge.dotClass}`} />
            {badge.label}
          </span>
        </div>

        {/* 右ブロック: 連勝バッジ・戦績パネル・右上サウンドボタン */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* 連勝表示 */}
          {isStreak ? (
            <div className="animate-streak-glow inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-gradient-to-r from-rose-600 via-amber-500 to-fuchsia-600 px-3 py-1 text-xs font-black tracking-wide text-white">
              <FlameIcon className="h-4 w-4 text-yellow-200" />
              <span>連勝中 {stats.streak}連</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-xs font-bold text-slate-300">
              <span className="text-slate-400">連勝</span>
              <span className="font-mono text-amber-300">{stats.streak}</span>
            </div>
          )}

          {/* 通算戦績パネル */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-700/80 bg-[#05070e]/90 px-3 py-1 text-xs">
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] text-slate-400">戦績</span>
              <span className="font-mono font-bold text-emerald-400">
                {stats.wins}勝
              </span>
              <span className="font-mono font-bold text-rose-400">
                {stats.losses}敗
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                ({totalGames === 0 ? '--' : `${winRate.toFixed(0)}%`})
              </span>
            </div>

            <div className="h-3.5 w-px bg-slate-700" />

            <div
              className="flex items-baseline gap-1"
              title={
                stats.totalEntries === 0
                  ? 'エントリー後に取引成立率が集計されます'
                  : `取引成立率: ${completionRate.toFixed(1)}%（${stats.totalEntries}戦中${stats.settledTrades}決着 / 途中離脱${unsettledCount}件）`
              }
            >
              <span className="text-[11px] text-slate-400">成立率</span>
              <span className={`font-mono font-bold ${completionColorClass}`}>
                {stats.totalEntries === 0
                  ? '--%'
                  : `${completionRate.toFixed(1)}%`}
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                ({stats.totalEntries}戦中{stats.settledTrades}決着)
              </span>
            </div>

            <div className="h-3.5 w-px bg-slate-700" />

            <div className="flex items-baseline gap-1">
              <span className="text-[11px] text-slate-400">仮想収支</span>
              <span
                className={`font-mono font-black ${
                  stats.totalPnl > 0
                    ? 'text-emerald-400'
                    : stats.totalPnl < 0
                      ? 'text-rose-400'
                      : 'text-slate-200'
                }`}
              >
                {stats.totalPnl >= 0 ? '+' : ''}
                {stats.totalPnl.toFixed(0)} {meta.unit}
              </span>
            </div>

            {(totalGames > 0 || stats.totalEntries > 0) && (
              <button
                type="button"
                onClick={onResetStats}
                className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                title="通算戦績をリセット"
                aria-label="通算戦績をリセット"
              >
                <RotateCcwIcon className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="h-3.5 w-px bg-slate-700" />

            <button
              type="button"
              data-testid="desktop-open-stats-btn"
              onClick={onOpenStats}
              className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-500/25"
              title="戦績詳細・SNS共有モーダルを開く"
            >
              <ShareIcon className="h-3 w-3" />
              <span>詳細・共有</span>
            </button>
          </div>

          {/* 右上 サウンド ON/OFF（ミュート）ボタン */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'サウンドをONにする' : 'サウンドをOFFにする'}
            className={`cursor-pointer inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
              muted
                ? 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                : 'border-cyan-400/60 bg-cyan-500/15 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.28)] hover:bg-cyan-500/25'
            }`}
          >
            {muted ? (
              <>
                <VolumeOffIcon className="h-4 w-4 text-rose-400" />
                <span>SOUND OFF</span>
              </>
            ) : (
              <>
                <VolumeOnIcon className="h-4 w-4 text-cyan-300" />
                <span>SOUND ON</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
