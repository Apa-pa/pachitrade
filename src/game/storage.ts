import type { GameStats } from './types.ts';

const STATS_STORAGE_KEY = 'pachi-trade-stats-v1';

export const DEFAULT_STATS: GameStats = {
  wins: 0,
  losses: 0,
  streak: 0,
  maxStreak: 0,
  totalPnl: 0,
  comebackWins: 0,
};

/** localStorage から通算戦績を安全に読み込む */
export function loadStats(): GameStats {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw) as Partial<GameStats>;
    return {
      wins: typeof parsed.wins === 'number' && Number.isFinite(parsed.wins) ? parsed.wins : 0,
      losses: typeof parsed.losses === 'number' && Number.isFinite(parsed.losses) ? parsed.losses : 0,
      streak: typeof parsed.streak === 'number' && Number.isFinite(parsed.streak) ? parsed.streak : 0,
      maxStreak: typeof parsed.maxStreak === 'number' && Number.isFinite(parsed.maxStreak) ? parsed.maxStreak : 0,
      totalPnl: typeof parsed.totalPnl === 'number' && Number.isFinite(parsed.totalPnl) ? parsed.totalPnl : 0,
      comebackWins:
        typeof parsed.comebackWins === 'number' && Number.isFinite(parsed.comebackWins)
          ? parsed.comebackWins
          : 0,
    };
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
