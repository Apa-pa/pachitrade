/** スロットリールの図柄種別 */
export type SlotSymbol =
  | 'SEVEN'
  | 'CHERRY'
  | 'WATERMELON'
  | 'BELL'
  | 'REPLAY'
  | 'BAR'
  | 'SKULL';

/** 成立役（強い順・役割別） */
export type SlotRole =
  | 'SEVEN'
  | 'MID_CHERRY'
  | 'REACH_EYE'
  | 'TRIPLE_CHERRY'
  | 'CHANCE_EYE'
  | 'WATERMELON'
  | 'WEAK_CHERRY'
  | 'BELL'
  | 'REPLAY'
  | 'MISS'
  | 'SKULL_OMEN'
  | 'SKULL';

/** 勝ち確定時の演出パターン（各25%） */
export type WinSequencePattern =
  | 'mid_cherry'
  | 'direct_seven'
  | 'reach_eye'
  | 'rare_trigger';

/** 負け確定時の演出パターン（各50%） */
export type LoseSequencePattern = 'skull_omen' | 'direct_skull';

/** 有効5ライン識別子 */
export type PaylineId = 'TOP' | 'MID' | 'BOT' | 'DIAG_DOWN' | 'DIAG_UP';

/** 直近の値動き（進捗変化速度）の分類 */
export type SlotMomentum =
  | 'fast_win'
  | 'mild_win'
  | 'stagnant'
  | 'toward_lose';

/** リール番号（0=左, 1=中, 2=右） */
export type ReelIndex = 0 | 1 | 2;

/** リール停止位置（上段コマ番号: 1〜12） */
export type StopPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 1リール分の表示列（[上段, 中段, 下段]） */
export type ReelColumn = [SlotSymbol, SlotSymbol, SlotSymbol];

/** 3×3リール上のセル座標 */
export interface GridCell {
  reel: 0 | 1 | 2;
  row: 0 | 1 | 2;
}

/** 1回転の抽選・停止出目結果 */
export interface SlotSpinResult {
  role: SlotRole;
  label: string;
  reels: [ReelColumn, ReelColumn, ReelColumn];
  stopPositions: [StopPosition, StopPosition, StopPosition];
  winningLines: PaylineId[];
  highlightCells: GridCell[];
  momentum: SlotMomentum;
}

/**
 * 各12コマ・ループ構造のリール配列（インデックス0=1番コマ〜11=12番コマ）
 * 12番の次は1番に繋がり、連続3コマに同一図柄が重複しない配置
 */
export const REEL_STRIPS: readonly [
  readonly SlotSymbol[],
  readonly SlotSymbol[],
  readonly SlotSymbol[],
] = [
  // 左リール (1〜12番)
  [
    'SEVEN',
    'WATERMELON',
    'REPLAY',
    'BELL',
    'BAR',
    'CHERRY',
    'REPLAY',
    'BELL',
    'SKULL',
    'WATERMELON',
    'REPLAY',
    'BELL',
  ],
  // 中リール (1〜12番)
  [
    'SEVEN',
    'REPLAY',
    'BELL',
    'WATERMELON',
    'CHERRY',
    'REPLAY',
    'BELL',
    'BAR',
    'SKULL',
    'REPLAY',
    'BELL',
    'WATERMELON',
  ],
  // 右リール (1〜12番)
  [
    'SEVEN',
    'BELL',
    'REPLAY',
    'CHERRY',
    'WATERMELON',
    'BELL',
    'REPLAY',
    'BAR',
    'SKULL',
    'REPLAY',
    'BELL',
    'WATERMELON',
  ],
];

/**
 * 指定リールの上段コマ番号（1〜12）から [上段, 中段, 下段] の3図柄を切り出す
 */
export function getReelColumn(
  reelIndex: ReelIndex,
  topPosition: StopPosition,
): ReelColumn {
  const strip = REEL_STRIPS[reelIndex];
  const len = strip.length;
  const idx0 = (topPosition - 1) % len;
  const idx1 = topPosition % len;
  const idx2 = (topPosition + 1) % len;
  return [strip[idx0], strip[idx1], strip[idx2]];
}

/**
 * 3リールの上段コマ番号配列から 3×3 表示出目を組み立てる
 */
export function buildGridFromStops(
  stops: readonly [StopPosition, StopPosition, StopPosition],
): [ReelColumn, ReelColumn, ReelColumn] {
  return [
    getReelColumn(0, stops[0]),
    getReelColumn(1, stops[1]),
    getReelColumn(2, stops[2]),
  ];
}

/** 有効5ライン定義（各リールの段インデックス: 0=上, 1=中, 2=下） */
export const PAYLINES: Record<
  PaylineId,
  readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]
> = {
  TOP: [0, 0, 0],
  MID: [1, 1, 1],
  BOT: [2, 2, 2],
  DIAG_DOWN: [0, 1, 2],
  DIAG_UP: [2, 1, 0],
};

export const ALL_PAYLINE_IDS: readonly PaylineId[] = [
  'TOP',
  'MID',
  'BOT',
  'DIAG_DOWN',
  'DIAG_UP',
];

const ROLE_LABELS: Record<SlotRole, string> = {
  SEVEN: 'BONUS',
  MID_CHERRY: '中段チェリー',
  REACH_EYE: 'リーチ目',
  TRIPLE_CHERRY: '3連チェリー',
  CHANCE_EYE: 'チャンス目',
  WATERMELON: 'スイカ',
  WEAK_CHERRY: 'チェリー',
  BELL: 'ベル',
  REPLAY: 'リプレイ',
  MISS: '',
  SKULL_OMEN: '',
  SKULL: 'SKULL',
};

/** 5ライン出目の厳密検査結果 */
export interface GridInspection {
  alignedLines: { line: PaylineId; symbol: SlotSymbol }[];
  watermelonTenpaiLines: PaylineId[];
  sevenTenpaiLines: PaylineId[];
  leftCherryRows: (0 | 1 | 2)[];
  midRightCherryCount: number;
  hasBarAligned: boolean;
  hasSkull: boolean;
  skullCount: number;
  midRightSkullCount: number;
  isMidRepRepSeven: boolean;
  isSmallVBell: boolean;
  isDiagonalBarSevenReach: boolean;
  isTopWatermelonReach: boolean;
  hasVerticalDuplicate: boolean;
}

/**
 * 3×3リール出目がパチスロの5ラインルール上どう判定されるかを厳密に検査する
 */
export function inspectGrid(
  reels: readonly [ReelColumn, ReelColumn, ReelColumn],
): GridInspection {
  const alignedLines: { line: PaylineId; symbol: SlotSymbol }[] = [];
  const watermelonTenpaiLines: PaylineId[] = [];
  const sevenTenpaiLines: PaylineId[] = [];

  for (const line of ALL_PAYLINE_IDS) {
    const [r0, r1, r2] = PAYLINES[line];
    const s0 = reels[0][r0];
    const s1 = reels[1][r1];
    const s2 = reels[2][r2];

    if (s0 === s1 && s1 === s2) {
      alignedLines.push({ line, symbol: s0 });
    } else {
      if (s0 === 'WATERMELON' && s1 === 'WATERMELON' && s2 !== 'WATERMELON') {
        watermelonTenpaiLines.push(line);
      }
      if (s0 === 'SEVEN' && s1 === 'SEVEN' && s2 !== 'SEVEN') {
        sevenTenpaiLines.push(line);
      }
    }
  }

  const leftCherryRows: (0 | 1 | 2)[] = [];
  for (const row of [0, 1, 2] as const) {
    if (reels[0][row] === 'CHERRY') {
      leftCherryRows.push(row);
    }
  }

  let midRightCherryCount = 0;
  let midRightSkullCount = 0;
  for (const reelIdx of [1, 2] as const) {
    for (const sym of reels[reelIdx]) {
      if (sym === 'CHERRY') midRightCherryCount += 1;
      if (sym === 'SKULL') midRightSkullCount += 1;
    }
  }

  let skullCount = 0;
  let hasVerticalDuplicate = false;
  for (const col of reels) {
    if (new Set(col).size !== col.length) {
      hasVerticalDuplicate = true;
    }
    for (const sym of col) {
      if (sym === 'SKULL') {
        skullCount += 1;
      }
    }
  }

  const isMidRepRepSeven =
    reels[0][1] === 'REPLAY' &&
    reels[1][1] === 'REPLAY' &&
    reels[2][1] === 'SEVEN';

  const noAligned = alignedLines.length === 0;
  const isSmallVBell =
    noAligned &&
    reels[0][0] === 'BELL' &&
    reels[1][1] === 'BELL' &&
    reels[2][0] === 'BELL';

  const isBarOrSeven = (s: SlotSymbol) => s === 'SEVEN' || s === 'BAR';
  const isDiagonalBarSevenReach =
    noAligned &&
    ((reels[0][0] === 'BAR' &&
      isBarOrSeven(reels[1][1]) &&
      isBarOrSeven(reels[2][2])) ||
      (reels[0][2] === 'BAR' &&
        isBarOrSeven(reels[1][1]) &&
        isBarOrSeven(reels[2][0])));

  const isTopWatermelonReach =
    noAligned &&
    watermelonTenpaiLines.includes('TOP') &&
    reels[2][1] === 'WATERMELON';

  return {
    alignedLines,
    watermelonTenpaiLines,
    sevenTenpaiLines,
    leftCherryRows,
    midRightCherryCount,
    hasBarAligned: alignedLines.some((a) => a.symbol === 'BAR'),
    hasSkull: skullCount > 0,
    skullCount,
    midRightSkullCount,
    isMidRepRepSeven,
    isSmallVBell,
    isDiagonalBarSevenReach,
    isTopWatermelonReach,
    hasVerticalDuplicate,
  };
}

/**
 * ライン上の3マス座標リストを返す
 */
function cellsOnLine(line: PaylineId): GridCell[] {
  const [r0, r1, r2] = PAYLINES[line];
  return [
    { reel: 0, row: r0 },
    { reel: 1, row: r1 },
    { reel: 2, row: r2 },
  ];
}

/** 重み付き停止テーブルエントリ */
export interface StopTableEntry {
  weight: number;
  stops: [StopPosition, StopPosition, StopPosition];
  winningLines: PaylineId[];
  highlightCells: GridCell[];
}

/**
 * 全12役（リーチ目A/B・チャンス目A/B含む）の目押しブレ対応停止テーブル
 * 各役の重み合計は 100
 */
export const ROLE_STOP_TABLES: Record<SlotRole, readonly StopTableEntry[]> = {
  // 1. 通常ハズレ（基本70%: 左3-4-5固定で中・右4パターン / 早押し20% / 遅押し10%）
  // ※別案「中10-11-12＋右10-11-12」は左3-4-5との組合せで上段リプレイ・中段ベルが揃うため不採用
  MISS: [
    {
      weight: 20,
      stops: [3, 5, 6],
      winningLines: [],
      highlightCells: [],
    },
    {
      weight: 20,
      stops: [3, 10, 2],
      winningLines: [],
      highlightCells: [],
    },
    {
      weight: 15,
      stops: [3, 3, 10],
      winningLines: [],
      highlightCells: [],
    },
    {
      weight: 15,
      stops: [3, 12, 5],
      winningLines: [],
      highlightCells: [],
    },
    {
      weight: 20,
      stops: [11, 5, 6],
      winningLines: [],
      highlightCells: [],
    },
    {
      weight: 10,
      stops: [7, 5, 6],
      winningLines: [],
      highlightCells: [],
    },
  ],

  // 2. リプレイ（基本・上段65% / ブレ・別コマ上段20% / ブレ・中段15%）
  REPLAY: [
    {
      weight: 65,
      stops: [3, 6, 3],
      winningLines: ['TOP'],
      highlightCells: cellsOnLine('TOP'),
    },
    {
      weight: 20,
      stops: [11, 10, 3],
      winningLines: ['TOP'],
      highlightCells: cellsOnLine('TOP'),
    },
    {
      weight: 15,
      stops: [2, 5, 6],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
  ],

  // 3. ベル（基本・中段70% / ブレ・7チラ見え中段20% / ブレ・右下がり斜め10%）
  BELL: [
    {
      weight: 70,
      stops: [3, 2, 5],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
    {
      weight: 20,
      stops: [11, 6, 1],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
    {
      weight: 10,
      stops: [12, 2, 12],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
  ],

  // 4. スイカ（基本・右下がり70% / ブレ・上段平行30%）
  WATERMELON: [
    {
      weight: 70,
      stops: [2, 3, 10],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
    {
      weight: 30,
      stops: [10, 4, 5],
      winningLines: ['TOP'],
      highlightCells: cellsOnLine('TOP'),
    },
  ],

  // 5 & 6. チャンス目（A: スイカ・スイカ・BAR 50%[基本80%/ブレ20%] / B: 小Vのベル 50%）
  CHANCE_EYE: [
    {
      weight: 40,
      stops: [2, 3, 6],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
    {
      weight: 10,
      stops: [10, 3, 6],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
    {
      weight: 50,
      stops: [12, 2, 2],
      winningLines: [],
      highlightCells: [
        { reel: 0, row: 0 },
        { reel: 1, row: 1 },
        { reel: 2, row: 0 },
      ],
    },
  ],

  // 7. 単チェリー角（基本・左下段角80% / ブレ・左上段角20%）
  WEAK_CHERRY: [
    {
      weight: 80,
      stops: [4, 6, 10],
      winningLines: ['BOT', 'DIAG_UP'],
      highlightCells: [{ reel: 0, row: 2 }],
    },
    {
      weight: 20,
      stops: [6, 6, 10],
      winningLines: ['TOP', 'DIAG_DOWN'],
      highlightCells: [{ reel: 0, row: 0 }],
    },
  ],

  // 8. 3連チェリー（基本・右上がり70% / ブレ・右下がり30%）
  TRIPLE_CHERRY: [
    {
      weight: 70,
      stops: [4, 4, 4],
      winningLines: ['DIAG_UP'],
      highlightCells: cellsOnLine('DIAG_UP'),
    },
    {
      weight: 30,
      stops: [6, 4, 2],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
  ],

  // 9. 中段チェリー（基本70%: 中・右中段7テンパイ煽り / ブレ30%）
  MID_CHERRY: [
    {
      weight: 70,
      stops: [5, 12, 12],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
    {
      weight: 30,
      stops: [5, 6, 6],
      winningLines: ['MID'],
      highlightCells: [{ reel: 0, row: 1 }],
    },
  ],

  // 10. 7揃い（基本・中段60% / ブレ・右下がり25% / ブレ・右上がり15%）
  SEVEN: [
    {
      weight: 60,
      stops: [12, 12, 12],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
    {
      weight: 25,
      stops: [1, 12, 11],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
    {
      weight: 15,
      stops: [11, 12, 1],
      winningLines: ['DIAG_UP'],
      highlightCells: cellsOnLine('DIAG_UP'),
    },
  ],

  // 11. ドクロ出現・ピンチ（2つテンパイ50% / 2つズレ目30% / 3つ非揃い20%）
  SKULL_OMEN: [
    {
      weight: 50,
      stops: [8, 8, 10],
      winningLines: [],
      highlightCells: [
        { reel: 0, row: 1 },
        { reel: 1, row: 1 },
      ],
    },
    {
      weight: 30,
      stops: [7, 5, 7],
      winningLines: [],
      highlightCells: [
        { reel: 0, row: 2 },
        { reel: 2, row: 2 },
      ],
    },
    {
      weight: 20,
      stops: [7, 9, 7],
      winningLines: [],
      highlightCells: [
        { reel: 0, row: 2 },
        { reel: 1, row: 0 },
        { reel: 2, row: 2 },
      ],
    },
  ],

  // 12. ドクロ揃い・LOSE（基本・中段75% / ブレ・右下がり25%）
  SKULL: [
    {
      weight: 75,
      stops: [8, 8, 8],
      winningLines: ['MID'],
      highlightCells: cellsOnLine('MID'),
    },
    {
      weight: 25,
      stops: [9, 8, 7],
      winningLines: ['DIAG_DOWN'],
      highlightCells: cellsOnLine('DIAG_DOWN'),
    },
  ],

  // 13 & 14. リーチ目（A: 右上がり BAR/7/7 50% / B: 上段スイカテンパイハズレ 50%）
  // ※旧中段リプ・リプ・7は廃止
  // ※リーチ目Aは本配列上でドクロ・左チェリー・他ライン揃いが混入しない唯一の出目 [3, 12, 1] を採用
  REACH_EYE: [
    {
      weight: 50,
      stops: [3, 12, 1],
      winningLines: ['DIAG_UP'],
      highlightCells: cellsOnLine('DIAG_UP'),
    },
    {
      weight: 50,
      stops: [10, 4, 11],
      winningLines: ['TOP'],
      highlightCells: [
        { reel: 0, row: 0 },
        { reel: 1, row: 0 },
        { reel: 2, row: 1 },
      ],
    },
  ],
};

function pickWeightedEntry(
  entries: readonly StopTableEntry[],
  rng: () => number,
): StopTableEntry {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const target = rng() * totalWeight;
  let acc = 0;
  for (const entry of entries) {
    acc += entry.weight;
    if (target < acc) {
      return entry;
    }
  }
  return entries[entries.length - 1];
}

function pickFrom<T>(list: readonly T[], rng: () => number): T {
  const idx = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[idx];
}

/**
 * 直近の値動き速度（deltaProgress）と現在進捗率（currentProgress）から勢いを分類する
 */
export function classifyMomentum(
  deltaProgress: number,
  currentProgress: number,
): SlotMomentum {
  if (deltaProgress >= 12 || (currentProgress >= 65 && deltaProgress >= 5)) {
    return 'fast_win';
  }
  if (deltaProgress <= -6 || (currentProgress <= -40 && deltaProgress <= 0)) {
    return 'toward_lose';
  }
  if (Math.abs(deltaProgress) < 6) {
    return 'stagnant';
  }
  return 'mild_win';
}

/**
 * 勢い分類に応じて確率テーブルから成立役を抽選する
 */
function pickRoleByMomentum(momentum: SlotMomentum, roll: number): SlotRole {
  switch (momentum) {
    case 'toward_lose':
      // 負けに近づくときはシンプルにハズレ目（100%）
      return 'MISS';
    case 'stagnant':
      // 停滞のときはリプレイ柄かベル（計75%）
      if (roll < 0.4) return 'REPLAY';
      if (roll < 0.75) return 'BELL';
      return 'MISS';
    case 'mild_win':
      // 緩やかな進行時はハズレ目が最多（58%）
      if (roll < 0.58) return 'MISS';
      if (roll < 0.72) return 'REPLAY';
      if (roll < 0.86) return 'BELL';
      if (roll < 0.94) return 'WEAK_CHERRY';
      if (roll < 0.98) return 'WATERMELON';
      return 'CHANCE_EYE';
    case 'fast_win':
      // 勝ちへ早い速度で近づくときはレア小役が高確率（計82%、中段チェリーは確定役専用のため除外）
      if (roll < 0.24) return 'WEAK_CHERRY';
      if (roll < 0.46) return 'WATERMELON';
      if (roll < 0.66) return 'CHANCE_EYE';
      if (roll < 0.82) return 'TRIPLE_CHERRY';
      if (roll < 0.86) return 'BELL';
      return 'MISS';
  }
}

/**
 * 指定された役の出目を停止テーブル（目押しブレ対応）から生成する共通ビルダー
 */
function buildSpinByRole(
  role: SlotRole,
  momentum: SlotMomentum,
  rng: () => number,
): SlotSpinResult {
  const entry = pickWeightedEntry(ROLE_STOP_TABLES[role], rng);
  const stopPositions: [StopPosition, StopPosition, StopPosition] = [
    ...entry.stops,
  ];
  return {
    role,
    label: ROLE_LABELS[role],
    reels: buildGridFromStops(stopPositions),
    stopPositions,
    winningLines: [...entry.winningLines],
    highlightCells: entry.highlightCells.map((cell) => ({ ...cell })),
    momentum,
  };
}

/**
 * 勢いに応じた1回転分のスロット出目を停止テーブルから抽選・生成する
 */
export function rollSlotSpin(
  momentum: SlotMomentum,
  rng: () => number = Math.random,
): SlotSpinResult {
  const role = pickRoleByMomentum(momentum, rng());
  return buildSpinByRole(role, momentum, rng);
}

/** 勝ち確定時の演出パターン（各25%）を抽選 */
export function rollWinSequencePattern(
  rng: () => number = Math.random,
): WinSequencePattern {
  const r = rng();
  if (r < 0.25) return 'mid_cherry';
  if (r < 0.5) return 'direct_seven';
  if (r < 0.75) return 'reach_eye';
  return 'rare_trigger';
}

/** 負け確定時の演出パターン（各50%）を抽選 */
export function rollLoseSequencePattern(
  rng: () => number = Math.random,
): LoseSequencePattern {
  return rng() < 0.5 ? 'skull_omen' : 'direct_skull';
}

/** 勝ち確定時の確定役（中段チェリー）出目を生成 */
export function createMidCherryWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildSpinByRole('MID_CHERRY', 'fast_win', rng);
}

/** 勝ち確定時の確定リーチ目（リーチ目A: 斜めBAR/7/7 または リーチ目B: 上段スイカテンパイハズレ）を生成 */
export function createReachEyeWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildSpinByRole('REACH_EYE', 'fast_win', rng);
}

/** 勝ち確定時の通常レア役トリガー出目（角チェリー / スイカ / チャンス目 / 3連チェリー）を生成 */
export function createRareTriggerWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  const rareRoles: readonly SlotRole[] = [
    'WEAK_CHERRY',
    'WATERMELON',
    'CHANCE_EYE',
    'TRIPLE_CHERRY',
  ];
  const picked = pickFrom(rareRoles, rng);
  return buildSpinByRole(picked, 'fast_win', rng);
}

/** 勝ち確定時（次回転・直当たり）の7揃い出目を生成（BONUS確定） */
export function createSevenWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildSpinByRole('SEVEN', 'fast_win', rng);
}

/** 負け確定前兆のドクロ2個以上非揃い出目を生成 */
export function createSkullOmenLoseSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildSpinByRole('SKULL_OMEN', 'toward_lose', rng);
}

/** 負け確定時のドクロ揃い出目を生成 */
export function createSkullLoseSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildSpinByRole('SKULL', 'toward_lose', rng);
}

/** ポジション未保有時の待機出目を生成（実在リールコマのクリーンなハズレ目） */
export function createIdleSpin(): SlotSpinResult {
  const stopPositions: [StopPosition, StopPosition, StopPosition] = [3, 12, 6];
  return {
    role: 'MISS',
    label: '',
    reels: buildGridFromStops(stopPositions),
    stopPositions,
    winningLines: [],
    highlightCells: [],
    momentum: 'stagnant',
  };
}
