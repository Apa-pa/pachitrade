import type { GameStats } from './types.ts';

const STATS_STORAGE_KEY = 'pachi-trade-stats-v1';

export const DEFAULT_STATS: GameStats = {
  wins: 0,
  losses: 0,
  streak: 0,
  maxStreak: 0,
  totalPnl: 0,
  comebackWins: 0,
  totalEntries: 0,
  settledTrades: 0,
};

/** 永続化データ（旧バージョン含む）を安全な GameStats へ正規化する */
export function normalizeStats(
  parsed: Partial<GameStats> | null | undefined,
): GameStats {
  const wins =
    typeof parsed?.wins === 'number' && Number.isFinite(parsed.wins) && parsed.wins >= 0
      ? Math.floor(parsed.wins)
      : 0;
  const losses =
    typeof parsed?.losses === 'number' && Number.isFinite(parsed.losses) && parsed.losses >= 0
      ? Math.floor(parsed.losses)
      : 0;
  const streak =
    typeof parsed?.streak === 'number' && Number.isFinite(parsed.streak) && parsed.streak >= 0
      ? Math.floor(parsed.streak)
      : 0;
  const maxStreak =
    typeof parsed?.maxStreak === 'number' && Number.isFinite(parsed.maxStreak) && parsed.maxStreak >= 0
      ? Math.floor(parsed.maxStreak)
      : 0;
  const totalPnl =
    typeof parsed?.totalPnl === 'number' && Number.isFinite(parsed.totalPnl)
      ? parsed.totalPnl
      : 0;
  const comebackWins =
    typeof parsed?.comebackWins === 'number' &&
    Number.isFinite(parsed.comebackWins) &&
    parsed.comebackWins >= 0
      ? Math.floor(parsed.comebackWins)
      : 0;

  // 旧バージョンからのマイグレーション時は既存の勝敗合計を決着数・開始数の基準にする
  const legacySettled = Math.max(0, wins + losses);
  const settledTrades =
    typeof parsed?.settledTrades === 'number' &&
    Number.isFinite(parsed.settledTrades) &&
    parsed.settledTrades >= 0
      ? Math.floor(parsed.settledTrades)
      : legacySettled;

  const rawTotalEntries =
    typeof parsed?.totalEntries === 'number' &&
    Number.isFinite(parsed.totalEntries) &&
    parsed.totalEntries >= 0
      ? Math.floor(parsed.totalEntries)
      : settledTrades;

  // データの不整合で成立率が100%を超えないよう決着数以上へ補正
  const totalEntries = Math.max(rawTotalEntries, settledTrades);

  return {
    wins,
    losses,
    streak,
    maxStreak,
    totalPnl,
    comebackWins,
    totalEntries,
    settledTrades,
  };
}

/** localStorage から通算戦績を安全に読み込む */
export function loadStats(): GameStats {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<GameStats>;
    return normalizeStats(parsed);
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/** 通算戦績を localStorage へ保存する */
export function saveStats(stats: GameStats): void {
  try {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // プライベートブラウジング等の容量制限エラーは無視
  }
}

/** 通算戦績を初期状態にリセットする */
export function resetStatsStorage(): GameStats {
  const fresh = { ...DEFAULT_STATS };
  saveStats(fresh);
  return fresh;
}
