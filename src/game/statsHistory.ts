import { getCompletionRate } from './engine.ts';
import type {
  SettlementResult,
  StatsFilter,
  StatsPeriodSummary,
  StatsProfile,
  TradeRecord,
} from './types.ts';

const HISTORY_STORAGE_KEY = 'pachi-trade-history-v1';
const PROFILE_STORAGE_KEY = 'pachi-trade-profile-v1';

/** 履歴保存件数のデフォルト上限と選択プリセット */
export const DEFAULT_MAX_HISTORY_COUNT = 1000;
export const HISTORY_LIMIT_PRESETS = [100, 300, 500, 1000, 2000] as const;
export const MIN_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 5000;
export const MAX_PLAYER_NAME_LENGTH = 20;

export const DEFAULT_STATS_PROFILE: StatsProfile = {
  playerName: '',
  maxHistoryCount: DEFAULT_MAX_HISTORY_COUNT,
};

/** 公開URL（SNSシェアテキストに添付） */
export const PUBLIC_APP_URL = 'https://pachitrade.papan-shiki.com/';

/** 履歴保存上限を安全な範囲へ丸める */
export function clampMaxHistoryCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_HISTORY_COUNT;
  return Math.max(
    MIN_HISTORY_LIMIT,
    Math.min(MAX_HISTORY_LIMIT, Math.round(value)),
  );
}

/** 決着結果から1件のトレード履歴レコードを生成する */
export function createTradeRecord(
  settlement: SettlementResult,
  settledAt = Date.now(),
): TradeRecord {
  return {
    t: settledAt,
    o: settlement.outcome === 'LOSE' ? 'L' : 'W',
    p: settlement.pnl,
    s: settlement.side === 'LONG' ? 'L' : 'S',
  };
}

/**
 * 履歴配列へ新規レコードを追記し、上限件数を超えた古いレコードを先頭から除去する
 */
export function appendTradeRecord(
  history: readonly TradeRecord[],
  record: TradeRecord,
  maxCount: number,
): TradeRecord[] {
  const limit = clampMaxHistoryCount(maxCount);
  const next = [...history, record];
  if (next.length <= limit) return next;
  return next.slice(next.length - limit);
}

/** 既存の履歴配列を指定件数上限へトリムする（新しい履歴を優先して残す） */
export function trimTradeHistory(
  history: readonly TradeRecord[],
  maxCount: number,
): TradeRecord[] {
  const limit = clampMaxHistoryCount(maxCount);
  if (history.length <= limit) return [...history];
  return history.slice(history.length - limit);
}

/**
 * 指定されたフィルタ（今日1日 / 直近N取引 / 全履歴）に一致する履歴を抽出する
 */
export function filterTradeRecords(
  history: readonly TradeRecord[],
  filter: StatsFilter,
  nowMs = Date.now(),
): TradeRecord[] {
  if (filter.kind === 'all') {
    return [...history];
  }

  if (filter.kind === 'today') {
    const now = new Date(nowMs);
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    return history.filter((r) => r.t >= startOfDay && r.t < endOfDay);
  }

  const count = Math.max(1, Math.floor(filter.count));
  if (history.length <= count) return [...history];
  return history.slice(history.length - count);
}

/**
 * 抽出済みレコード配列から戦績サマリー（収支・平均収支・勝率・最大連勝・最大連敗）を集計する
 */
export function summarizeTradeRecords(
  records: readonly TradeRecord[],
): StatsPeriodSummary {
  const totalTrades = records.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      maxWinStreak: 0,
      maxLoseStreak: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let totalPnl = 0;
  let currentWin = 0;
  let currentLose = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;

  for (const r of records) {
    totalPnl += r.p;
    if (r.o === 'W') {
      wins += 1;
      currentWin += 1;
      currentLose = 0;
      if (currentWin > maxWinStreak) maxWinStreak = currentWin;
    } else {
      losses += 1;
      currentLose += 1;
      currentWin = 0;
      if (currentLose > maxLoseStreak) maxLoseStreak = currentLose;
    }
  }

  return {
    totalTrades,
    wins,
    losses,
    winRate: (wins / totalTrades) * 100,
    totalPnl,
    avgPnl: totalPnl / totalTrades,
    maxWinStreak,
    maxLoseStreak,
  };
}

/** 集計フィルタの日本語ラベルを返す */
export function getStatsFilterLabel(filter: StatsFilter): string {
  switch (filter.kind) {
    case 'today':
      return '今日の成績';
    case 'recent':
      return `直近${Math.max(1, Math.floor(filter.count))}トレード`;
    case 'all':
      return '保存済み全トレード';
  }
}

/** SNSシェア用テキストを生成する */
export function buildShareText(params: {
  playerName: string;
  filter: StatsFilter;
  summary: StatsPeriodSummary;
  unit: string;
  totalEntries: number;
  settledTrades: number;
}): string {
  const { playerName, filter, summary, unit, totalEntries, settledTrades } =
    params;
  const trimmedName = playerName.trim();
  const titleName = trimmedName ? `${trimmedName}の` : '';
  const periodLabel = getStatsFilterLabel(filter);
  const pnlSign = summary.totalPnl >= 0 ? '+' : '';
  const avgSign = summary.avgPnl >= 0 ? '+' : '';
  const winRateText =
    summary.totalTrades === 0 ? '--' : `${summary.winRate.toFixed(1)}%`;
  const completionRateText =
    totalEntries === 0
      ? '--%'
      : `${getCompletionRate({ totalEntries, settledTrades }).toFixed(1)}%`;
  const avgText =
    summary.totalTrades === 0
      ? '--'
      : `${avgSign}${summary.avgPnl.toFixed(1)} ${unit}`;

  return [
    `🎰 PACHI-TRADE ${titleName}${periodLabel}`,
    `💰 収支: ${pnlSign}${summary.totalPnl.toFixed(0)} ${unit}（平均 ${avgText}/戦）`,
    `📊 勝率: ${winRateText}（${summary.wins}勝 ${summary.losses}敗 / 計${summary.totalTrades}戦）`,
    `🛡️ 取引成立率: ${completionRateText}（${totalEntries}戦中${settledTrades}決着）`,
    `🔥 最大連勝: ${summary.maxWinStreak}連 / 💀 最大連敗: ${summary.maxLoseStreak}連`,
    `#PachiTrade`,
    PUBLIC_APP_URL,
  ].join('\n');
}

/** localStorage からトレード履歴を安全に読み込む */
export function loadTradeHistory(maxCount: number): TradeRecord[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const valid: TradeRecord[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof item.t === 'number' &&
        Number.isFinite(item.t) &&
        (item.o === 'W' || item.o === 'L') &&
        typeof item.p === 'number' &&
        Number.isFinite(item.p) &&
        (item.s === 'L' || item.s === 'S')
      ) {
        valid.push({
          t: item.t,
          o: item.o,
          p: item.p,
          s: item.s,
        });
      }
    }
    return trimTradeHistory(valid, maxCount);
  } catch {
    return [];
  }
}

/** トレード履歴を localStorage へ保存する */
export function saveTradeHistory(history: readonly TradeRecord[]): void {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // プライベートブラウジング等の容量制限エラーは無視
  }
}

/** トレード履歴を空にリセットする */
export function clearTradeHistoryStorage(): TradeRecord[] {
  saveTradeHistory([]);
  return [];
}

/** localStorage からプロフィール（名前・保存件数上限）を読み込む */
export function loadStatsProfile(): StatsProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS_PROFILE };
    const parsed = JSON.parse(raw) as Partial<StatsProfile>;
    return {
      playerName:
        typeof parsed.playerName === 'string'
          ? parsed.playerName.slice(0, MAX_PLAYER_NAME_LENGTH)
          : '',
      maxHistoryCount:
        typeof parsed.maxHistoryCount === 'number'
          ? clampMaxHistoryCount(parsed.maxHistoryCount)
          : DEFAULT_MAX_HISTORY_COUNT,
    };
  } catch {
    return { ...DEFAULT_STATS_PROFILE };
  }
}

/** プロフィール（名前・保存件数上限）を localStorage へ保存する */
export function saveStatsProfile(profile: StatsProfile): void {
  try {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        playerName: profile.playerName.slice(0, MAX_PLAYER_NAME_LENGTH),
        maxHistoryCount: clampMaxHistoryCount(profile.maxHistoryCount),
      }),
    );
  } catch {
    // プライベートブラウジング等の容量制限エラーは無視
  }
}

/** 履歴データの推定保存サイズ（KB）を返す */
export function estimateHistorySizeKb(history: readonly TradeRecord[]): number {
  const bytes = JSON.stringify(history).length;
  return bytes / 1024;
}
