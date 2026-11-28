import { useEffect, useMemo, useState } from 'react';
import pachiTradeLogoNeon from '../../asset/logo/pachi-trade-logo-neon-transparent.webp';
import { getCompletionRate, getUnsettledCount } from '../game/engine.ts';
import {
  buildShareText,
  estimateHistorySizeKb,
  filterTradeRecords,
  getStatsFilterLabel,
  HISTORY_LIMIT_PRESETS,
  MAX_PLAYER_NAME_LENGTH,
  PUBLIC_APP_URL,
  summarizeTradeRecords,
} from '../game/statsHistory.ts';
import type {
  GameStats,
  StatsFilter,
  StatsPeriodSummary,
  StatsProfile,
  TradeRecord,
} from '../game/types.ts';
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  RotateCcwIcon,
  ShareIcon,
  TrophyIcon,
  UserIcon,
} from './Icons.tsx';

interface StatsModalProps {
  open: boolean;
  onClose: () => void;
  stats: GameStats;
  tradeHistory: readonly TradeRecord[];
  profile: StatsProfile;
  unit: string;
  onChangePlayerName: (name: string) => void;
  onChangeMaxHistoryCount: (count: number) => void;
  onResetStats: () => void;
}

const RECENT_COUNT_PRESETS = [20, 50, 100, 300] as const;

/** 角丸矩形のパスを描く Canvas ヘルパー */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

let cachedBrandLogoPromise: Promise<HTMLImageElement | null> | null = null;

/**
 * 戦績カード用のブランドロゴ画像を事前読み込み・キャッシュする
 */
function loadStatsCardBrandLogo(): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (cachedBrandLogoPromise) return cachedBrandLogoPromise;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      if (!result) {
        // 一時的な読み込み失敗時は次回再試行できるようキャッシュを破棄する
        cachedBrandLogoPromise = null;
      }
      resolve(result);
    };

    const timerId = window.setTimeout(() => finish(null), 2000);
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(
          () => finish(img),
          () => finish(img.naturalWidth > 0 ? img : null),
        );
      } else {
        finish(img);
      }
    };
    img.onerror = () => finish(null);
    img.src = pachiTradeLogoNeon;
  });

  cachedBrandLogoPromise = promise;
  return promise;
}

/**
 * SNS添付用の戦績カード画像（1200×630 PNG）を Canvas で生成しダウンロードする
 */
async function downloadStatsCardPng(params: {
  playerName: string;
  filter: StatsFilter;
  summary: StatsPeriodSummary;
  unit: string;
  totalEntries: number;
  settledTrades: number;
}): Promise<void> {
  const {
    playerName,
    filter,
    summary,
    unit,
    totalEntries,
    settledTrades,
  } = params;
  const logoImg = await loadStatsCardBrandLogo();
  const width = 1200;
  const height = 630;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 背景グラデーション
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#070b16');
  bg.addColorStop(0.55, '#0e172e');
  bg.addColorStop(1, '#180c24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // 背景ラジアルグロウ
  const glow1 = ctx.createRadialGradient(180, 110, 20, 180, 110, 420);
  glow1.addColorStop(0, 'rgba(34, 211, 238, 0.22)');
  glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(1020, 520, 20, 1020, 520, 420);
  glow2.addColorStop(0, 'rgba(217, 70, 239, 0.2)');
  glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // 外枠ネオンフレーム
  drawRoundedRect(ctx, 28, 28, width - 56, height - 56, 28);
  ctx.fillStyle = 'rgba(11, 17, 32, 0.84)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  ctx.stroke();

  // 上部ブランドロゴ＆集計期間バッジ
  if (logoImg && logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
    const logoH = 54;
    const logoW = Math.round((logoImg.naturalWidth / logoImg.naturalHeight) * logoH);
    ctx.drawImage(logoImg, 64, 56, logoW, logoH);
  } else {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '900 32px system-ui, sans-serif';
    ctx.fillText('PACHI-TRADE', 64, 95);
  }

  const displayName = playerName.trim() || 'PACHI-TRADE';
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 26px "Noto Sans JP", system-ui, sans-serif';
  ctx.fillText(`${displayName} の戦績`, 64, 152);

  const periodText = getStatsFilterLabel(filter);
  ctx.font = 'bold 20px "Noto Sans JP", system-ui, sans-serif';
  const badgeW = Math.max(180, ctx.measureText(periodText).width + 44);
  drawRoundedRect(ctx, width - 64 - badgeW, 64, badgeW, 44, 22);
  ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
  ctx.stroke();
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.fillText(periodText, width - 64 - badgeW / 2, 93);
  ctx.textAlign = 'left';

  // メイン収支カード（合計収支＋1トレード平均収支）
  drawRoundedRect(ctx, 64, 182, width - 128, 162, 20);
  ctx.fillStyle = 'rgba(5, 8, 17, 0.85)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 20px "Noto Sans JP", system-ui, sans-serif';
  ctx.fillText('仮想収支', 96, 226);

  const pnlSign = summary.totalPnl >= 0 ? '+' : '';
  ctx.fillStyle =
    summary.totalPnl > 0
      ? '#34d399'
      : summary.totalPnl < 0
        ? '#fb7185'
        : '#f1f5f9';
  ctx.font = '900 64px monospace';
  ctx.fillText(`${pnlSign}${summary.totalPnl.toFixed(0)} ${unit}`, 96, 304);

  // 右側: 1トレード平均収支
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 20px "Noto Sans JP", system-ui, sans-serif';
  ctx.fillText('1トレード平均収支', width - 96, 226);

  const avgSign = summary.avgPnl >= 0 ? '+' : '';
  const avgText =
    summary.totalTrades === 0
      ? `-- ${unit}`
      : `${avgSign}${summary.avgPnl.toFixed(1)} ${unit}`;
  ctx.fillStyle =
    summary.totalTrades === 0
      ? '#cbd5e1'
      : summary.avgPnl >= 0
        ? '#67e8f9'
        : '#fda4af';
  ctx.font = '900 42px monospace';
  ctx.fillText(avgText, width - 96, 296);
  ctx.textAlign = 'left';

  // 下段4カード（勝率 / 取引成立率 / 最大連勝 / 最大連敗）
  const completionRate = getCompletionRate({ totalEntries, settledTrades });
  const completionColor =
    totalEntries === 0
      ? '#cbd5e1'
      : completionRate >= 90
        ? '#67e8f9'
        : completionRate >= 70
          ? '#fbbf24'
          : '#fb7185';
  const cards: Array<{
    title: string;
    value: string;
    sub: string;
    color: string;
  }> = [
    {
      title: '勝率',
      value: summary.totalTrades === 0 ? '--%' : `${summary.winRate.toFixed(1)}%`,
      sub: `${summary.wins}勝 ${summary.losses}敗 / 計${summary.totalTrades}戦`,
      color: '#f8fafc',
    },
    {
      title: '取引成立率',
      value: totalEntries === 0 ? '--%' : `${completionRate.toFixed(1)}%`,
      sub: `${totalEntries}戦中${settledTrades}決着`,
      color: completionColor,
    },
    {
      title: '最大連勝',
      value: `${summary.maxWinStreak}連勝`,
      sub: '最高連勝記録',
      color: '#fbbf24',
    },
    {
      title: '最大連敗',
      value: `${summary.maxLoseStreak}連敗`,
      sub: '最大連敗記録',
      color: '#c084fc',
    },
  ];

  const cardGap = 18;
  const cardW = (width - 128 - cardGap * 3) / 4;
  cards.forEach((c, idx) => {
    const cx = 64 + idx * (cardW + cardGap);
    const cy = 368;
    drawRoundedRect(ctx, cx, cy, cardW, 152, 18);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px "Noto Sans JP", system-ui, sans-serif';
    ctx.fillText(c.title, cx + 22, cy + 40);

    ctx.fillStyle = c.color;
    ctx.font = '900 36px monospace';
    ctx.fillText(c.value, cx + 22, cy + 94);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 15px "Noto Sans JP", system-ui, sans-serif';
    ctx.fillText(c.sub, cx + 22, cy + 128);
  });

  // フッターURL
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`#PachiTrade  |  ${PUBLIC_APP_URL}`, 64, height - 52);

  const link = document.createElement('a');
  link.download = 'pachi-trade-stats.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * PC・モバイル共通のSNS共有対応 戦績モーダル
 */
export function StatsModal({
  open,
  onClose,
  stats,
  tradeHistory,
  profile,
  unit,
  onChangePlayerName,
  onChangeMaxHistoryCount,
  onResetStats,
}: StatsModalProps) {
  const [filterKind, setFilterKind] = useState<StatsFilter['kind']>('recent');
  const [recentCount, setRecentCount] = useState<number>(100);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // モーダルを開いたときにロゴを事前読み込みし、閉じたときに確認状態等をリセット
  useEffect(() => {
    if (open) {
      void loadStatsCardBrandLogo();
    } else {
      setConfirmReset(false);
      setCopied(false);
    }
  }, [open]);

  const activeFilter: StatsFilter = useMemo(() => {
    if (filterKind === 'today') return { kind: 'today' };
    if (filterKind === 'all') return { kind: 'all' };
    return { kind: 'recent', count: recentCount };
  }, [filterKind, recentCount]);

  const filteredRecords = useMemo(
    () => filterTradeRecords(tradeHistory, activeFilter),
    [tradeHistory, activeFilter],
  );

  const summary = useMemo(
    () => summarizeTradeRecords(filteredRecords),
    [filteredRecords],
  );

  const shareText = useMemo(
    () =>
      buildShareText({
        playerName: profile.playerName,
        filter: activeFilter,
        summary,
        unit,
        totalEntries: stats.totalEntries,
        settledTrades: stats.settledTrades,
      }),
    [
      profile.playerName,
      activeFilter,
      summary,
      unit,
      stats.totalEntries,
      stats.settledTrades,
    ],
  );

  if (!open) return null;

  const estimatedKb = estimateHistorySizeKb(tradeHistory);
  const displayName = profile.playerName.trim() || 'PACHI-TRADE';
  const completionRate = getCompletionRate(stats);
  const unsettledCount = getUnsettledCount(stats);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードアクセス非対応環境は無視
    }
  };

  const handleShareToX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadImage = () => {
    void downloadStatsCardPng({
      playerName: profile.playerName,
      filter: activeFilter,
      summary,
      unit,
      totalEntries: stats.totalEntries,
      settledTrades: stats.settledTrades,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="戦績・SNS共有"
      data-testid="stats-modal"
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-cyan-500/35 bg-[#0b1120] text-slate-100 shadow-[0_0_45px_rgba(6,182,212,0.22)]"
      >
        {/* モーダルヘッダー */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-black tracking-wide text-white sm:text-base">
              戦績レポート・SNS共有
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="戦績画面を閉じる"
            className="cursor-pointer inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            <CloseIcon className="h-3.5 w-3.5" />
            <span>閉じる</span>
          </button>
        </div>

        {/* スクロール可能な中身 */}
        <div className="space-y-3.5 overflow-y-auto p-4">
          {/* プレイヤー名登録 */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#060913] px-3 py-2">
            <UserIcon className="h-4 w-4 shrink-0 text-cyan-400" />
            <label
              htmlFor="stats-player-name"
              className="shrink-0 text-xs font-bold text-slate-400"
            >
              名前
            </label>
            <input
              id="stats-player-name"
              data-testid="stats-player-name-input"
              type="text"
              maxLength={MAX_PLAYER_NAME_LENGTH}
              placeholder="ニックネームを入力（例: パチトレ太郎）"
              value={profile.playerName}
              onChange={(e) => onChangePlayerName(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-white placeholder:font-normal placeholder:text-slate-600 focus:outline-none sm:text-sm"
            />
            <span className="shrink-0 font-mono text-[10px] text-slate-500">
              {profile.playerName.length}/{MAX_PLAYER_NAME_LENGTH}
            </span>
          </div>

          {/* 集計範囲タブ（今日1日 / 直近N取引 / 全履歴） */}
          <div className="space-y-2">
            <div
              role="group"
              aria-label="集計範囲の切り替え"
              className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-[#050811] p-1"
            >
              <button
                type="button"
                data-testid="stats-filter-today"
                onClick={() => setFilterKind('today')}
                className={`cursor-pointer rounded-lg py-1.5 text-xs font-bold transition ${
                  filterKind === 'today'
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                今日（1日）
              </button>
              <button
                type="button"
                data-testid="stats-filter-recent"
                onClick={() => setFilterKind('recent')}
                className={`cursor-pointer rounded-lg py-1.5 text-xs font-bold transition ${
                  filterKind === 'recent'
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                直近トレード
              </button>
              <button
                type="button"
                data-testid="stats-filter-all"
                onClick={() => setFilterKind('all')}
                className={`cursor-pointer rounded-lg py-1.5 text-xs font-bold transition ${
                  filterKind === 'all'
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                保存済み全件
              </button>
            </div>

            {/* 直近N取引のプリセット＆任意件数指定 */}
            {filterKind === 'recent' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-[#070b15] px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    表示数:
                  </span>
                  {RECENT_COUNT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRecentCount(preset)}
                      className={`cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                        recentCount === preset
                          ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {preset}戦
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400">任意:</span>
                  <input
                    type="number"
                    min={1}
                    max={profile.maxHistoryCount}
                    aria-label="直近トレード数（任意入力）"
                    value={recentCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val >= 1) {
                        setRecentCount(Math.floor(val));
                      }
                    }}
                    className="w-16 rounded border border-slate-700 bg-[#050811] px-1.5 py-0.5 text-right font-mono text-xs font-bold text-white outline-none focus:border-cyan-400"
                  />
                  <span className="text-[11px] text-slate-400">戦</span>
                </div>
              </div>
            )}
          </div>

          {/* SNS共有用戦績カードプレビュー */}
          <div
            data-testid="stats-card-preview"
            className="relative overflow-hidden rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-[#0c1428] via-[#091022] to-[#170b24] p-4 shadow-[inset_0_0_28px_rgba(34,211,238,0.12)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 rounded bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                  777
                </span>
                <span className="truncate text-sm font-black text-cyan-300">
                  {displayName}
                </span>
              </div>
              <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-200">
                {getStatsFilterLabel(activeFilter)}
              </span>
            </div>

            {/* 収支＆1トレードあたり平均収支 */}
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-800/90 bg-[#050812]/90 p-3 sm:grid-cols-2 sm:items-center">
              <div>
                <div className="text-[10px] font-bold text-slate-400">
                  仮想収支
                </div>
                <div
                  className={`font-mono text-2xl font-black tracking-tight sm:text-3xl ${
                    summary.totalPnl > 0
                      ? 'text-emerald-400'
                      : summary.totalPnl < 0
                        ? 'text-rose-400'
                        : 'text-slate-100'
                  }`}
                >
                  {summary.totalPnl >= 0 ? '+' : ''}
                  {summary.totalPnl.toFixed(0)}{' '}
                  <span className="text-sm font-bold text-slate-400">
                    {unit}
                  </span>
                </div>
              </div>

              <div className="sm:text-right">
                <div className="text-[10px] font-bold text-slate-400">
                  1トレード平均収支
                </div>
                <div
                  className={`font-mono text-lg font-black sm:text-xl ${
                    summary.totalTrades === 0
                      ? 'text-slate-400'
                      : summary.avgPnl >= 0
                        ? 'text-cyan-300'
                        : 'text-rose-300'
                  }`}
                >
                  {summary.totalTrades === 0
                    ? `-- ${unit}`
                    : `${summary.avgPnl >= 0 ? '+' : ''}${summary.avgPnl.toFixed(1)} ${unit}`}
                </div>
              </div>
            </div>

            {/* 勝率・取引成立率・最大連勝・最大連敗 */}
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-2 py-2">
                <div className="text-[10px] text-slate-400">勝率</div>
                <div className="mt-0.5 font-mono text-base font-black text-white sm:text-lg">
                  {summary.totalTrades === 0
                    ? '--%'
                    : `${summary.winRate.toFixed(1)}%`}
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  {summary.wins}勝{summary.losses}敗 / {summary.totalTrades}戦
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-2 py-2">
                <div className="text-[10px] text-slate-400">取引成立率</div>
                <div
                  className={`mt-0.5 font-mono text-base font-black sm:text-lg ${
                    stats.totalEntries === 0
                      ? 'text-slate-400'
                      : completionRate >= 90
                        ? 'text-cyan-300'
                        : completionRate >= 70
                          ? 'text-amber-300'
                          : 'text-rose-400'
                  }`}
                >
                  {stats.totalEntries === 0
                    ? '--%'
                    : `${completionRate.toFixed(1)}%`}
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  {stats.totalEntries}戦中{stats.settledTrades}決着
                  {unsettledCount > 0 && `（未決着${unsettledCount}）`}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-2 py-2">
                <div className="text-[10px] text-slate-400">最大連勝</div>
                <div className="mt-0.5 font-mono text-base font-black text-amber-300 sm:text-lg">
                  {summary.maxWinStreak}連勝
                </div>
                <div className="text-[10px] text-slate-500">WIN STREAK</div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-2 py-2">
                <div className="text-[10px] text-slate-400">最大連敗</div>
                <div className="mt-0.5 font-mono text-base font-black text-purple-300 sm:text-lg">
                  {summary.maxLoseStreak}連敗
                </div>
                <div className="text-[10px] text-slate-500">LOSE STREAK</div>
              </div>
            </div>

            {summary.totalTrades === 0 && (
              <p className="mt-2.5 text-center text-[11px] text-slate-400">
                ※この期間のトレード履歴がまだありません（決済完了時に自動記録されます）
              </p>
            )}
          </div>

          {/* SNS共有アクションボタン */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="stats-share-x-btn"
              onClick={handleShareToX}
              className="cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-950 transition hover:bg-white active:scale-[0.98]"
            >
              <ShareIcon className="h-3.5 w-3.5" />
              <span>Xでシェア</span>
            </button>

            <button
              type="button"
              data-testid="stats-copy-btn"
              onClick={handleCopyText}
              className={`cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition active:scale-[0.98] ${
                copied
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5" />
                  <span>コピー完了</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  <span>コピー</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="stats-download-png-btn"
              onClick={handleDownloadImage}
              className="cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/15 px-3 py-2.5 text-xs font-bold text-fuchsia-200 transition hover:bg-fuchsia-500/25 active:scale-[0.98]"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span>画像保存</span>
            </button>
          </div>

          {/* 履歴保存上限設定 & 戦績リセット */}
          <div className="space-y-2 rounded-xl border border-slate-800/90 bg-[#060913] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-300">
                ローカル保存上限
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                保存中: {tradeHistory.length} / {profile.maxHistoryCount}件（約{' '}
                {estimatedKb.toFixed(1)} KB）
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {HISTORY_LIMIT_PRESETS.map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => onChangeMaxHistoryCount(limit)}
                    className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] font-bold transition ${
                      profile.maxHistoryCount === limit
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {limit}件
                  </button>
                ))}
              </div>

              {confirmReset ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onResetStats();
                      setConfirmReset(false);
                    }}
                    className="cursor-pointer rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-black text-white hover:bg-rose-500"
                  >
                    リセット確定
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="cursor-pointer rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300"
                  >
                    戻す
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/20"
                >
                  <RotateCcwIcon className="h-3.5 w-3.5" />
                  <span>戦績リセット</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
