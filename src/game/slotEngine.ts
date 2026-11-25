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
  winningLines: PaylineId[];
  highlightCells: GridCell[];
  momentum: SlotMomentum;
}

/** 有効5ライン定義（各リールの段インデックス: 0=上, 1=中, 2=下） */
export const PAYLINES: Record<PaylineId, readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]> = {
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

/** 3連チェリーで使うライン（中段単発の中段チェリーと棲み分けるため上下・斜めの4ライン） */
const TRIPLE_CHERRY_LINES: readonly PaylineId[] = [
  'DIAG_DOWN',
  'DIAG_UP',
  'TOP',
  'BOT',
];

/** 7揃い・ドクロ揃いは中段固定 */
const MAIN_WIN_LINES: readonly PaylineId[] = ['MID'];

const SKULL_LINES: readonly PaylineId[] = ['MID'];

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
  hasBarAligned: boolean;
  hasSkull: boolean;
  skullCount: number;
  isMidRepRepSeven: boolean;
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

  return {
    alignedLines,
    watermelonTenpaiLines,
    sevenTenpaiLines,
    leftCherryRows,
    hasBarAligned: alignedLines.some((a) => a.symbol === 'BAR'),
    hasSkull: skullCount > 0,
    skullCount,
    isMidRepRepSeven,
    hasVerticalDuplicate,
  };
}

/** 空きマスを埋める際に使える通常図柄プール */
const FILLER_POOL_WITHOUT_CHERRY: readonly SlotSymbol[] = [
  'BELL',
  'REPLAY',
  'WATERMELON',
  'BAR',
  'SEVEN',
];

const FILLER_POOL_FULL: readonly SlotSymbol[] = [
  'BELL',
  'REPLAY',
  'WATERMELON',
  'BAR',
  'SEVEN',
  'CHERRY',
];

function shuffleWithRng<T>(arr: readonly T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type FixedSpec = Partial<Record<0 | 1 | 2, SlotSymbol>>;

interface GenerationConstraint {
  role: SlotRole;
  expectedLine?: PaylineId;
  expectedSymbol?: SlotSymbol;
  expectedLeftCherryRow?: 0 | 1 | 2;
  fixedCols: [FixedSpec, FixedSpec, FixedSpec];
  allowCherryInLeft: boolean;
  allowCherryInMidRight: boolean;
  allowSevenInGrid: boolean;
}

function isGridValid(
  reels: [ReelColumn, ReelColumn, ReelColumn],
  c: GenerationConstraint,
): boolean {
  const info = inspectGrid(reels);

  // 全役共通の不変条件
  if (info.hasVerticalDuplicate) return false;
  if (info.hasBarAligned) return false;
  if (c.role !== 'SKULL' && c.role !== 'SKULL_OMEN' && info.skullCount > 0) {
    return false;
  }
  if (c.role !== 'REACH_EYE' && info.isMidRepRepSeven) {
    return false;
  }
  if (!c.allowCherryInLeft && info.leftCherryRows.length > 0) return false;
  if (c.role !== 'CHANCE_EYE' && info.watermelonTenpaiLines.length > 0) {
    return false;
  }

  switch (c.role) {
    case 'MISS':
      return (
        info.alignedLines.length === 0 &&
        info.sevenTenpaiLines.length === 0
      );
    case 'SKULL_OMEN':
      return (
        info.alignedLines.length === 0 &&
        info.skullCount >= 2 &&
        info.sevenTenpaiLines.length === 0
      );
    case 'REACH_EYE':
      return (
        info.alignedLines.length === 0 &&
        info.isMidRepRepSeven
      );
    case 'REPLAY':
    case 'BELL':
    case 'WATERMELON':
    case 'SEVEN':
    case 'SKULL':
    case 'TRIPLE_CHERRY':
      return (
        info.alignedLines.length === 1 &&
        info.alignedLines[0].line === c.expectedLine &&
        info.alignedLines[0].symbol === c.expectedSymbol
      );
    case 'WEAK_CHERRY':
      return (
        info.alignedLines.length === 0 &&
        info.leftCherryRows.length === 1 &&
        info.leftCherryRows[0] === c.expectedLeftCherryRow
      );
    case 'MID_CHERRY':
      return (
        info.alignedLines.length === 0 &&
        info.leftCherryRows.length === 1 &&
        info.leftCherryRows[0] === 1
      );
    case 'CHANCE_EYE':
      return (
        info.alignedLines.length === 0 &&
        info.watermelonTenpaiLines.length === 1 &&
        info.watermelonTenpaiLines[0] === c.expectedLine
      );
  }
}

/** 固定マスに沿って1リール分の列をランダム生成 */
function buildRandomColumn(
  fixed: FixedSpec,
  pool: readonly SlotSymbol[],
  rng: () => number,
): ReelColumn | null {
  const used = new Set<SlotSymbol>();
  const col: (SlotSymbol | null)[] = [null, null, null];

  for (const row of [0, 1, 2] as const) {
    const sym = fixed[row];
    if (sym) {
      if (used.has(sym)) return null;
      used.add(sym);
      col[row] = sym;
    }
  }

  const available = shuffleWithRng(
    pool.filter((s) => !used.has(s)),
    rng,
  );

  let idx = 0;
  for (const row of [0, 1, 2] as const) {
    if (!col[row]) {
      if (idx >= available.length) return null;
      col[row] = available[idx];
      idx += 1;
    }
  }

  return col as ReelColumn;
}

/**
 * 制約を満たす3×3出目を探索生成（失敗時は事前検証済みフォールバックを使用）
 */
function generateValidReels(
  c: GenerationConstraint,
  rng: () => number,
  fallback: [ReelColumn, ReelColumn, ReelColumn],
): [ReelColumn, ReelColumn, ReelColumn] {
  const leftPoolBase = c.allowCherryInLeft
    ? FILLER_POOL_FULL
    : FILLER_POOL_WITHOUT_CHERRY;
  const midRightPoolBase = c.allowCherryInMidRight
    ? FILLER_POOL_FULL
    : FILLER_POOL_WITHOUT_CHERRY;

  const filterSeven = (pool: readonly SlotSymbol[]) =>
    c.allowSevenInGrid ? pool : pool.filter((s) => s !== 'SEVEN');

  const leftPool = filterSeven(leftPoolBase);
  const midRightPool = filterSeven(midRightPoolBase);

  for (let attempt = 0; attempt < 250; attempt++) {
    const col0 = buildRandomColumn(c.fixedCols[0], leftPool, rng);
    const col1 = buildRandomColumn(c.fixedCols[1], midRightPool, rng);
    const col2 = buildRandomColumn(c.fixedCols[2], midRightPool, rng);
    if (!col0 || !col1 || !col2) continue;

    const candidate: [ReelColumn, ReelColumn, ReelColumn] = [col0, col1, col2];
    if (isGridValid(candidate, c)) {
      return candidate;
    }
  }

  return fallback;
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

function pickFrom<T>(list: readonly T[], rng: () => number): T {
  const idx = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[idx];
}

/** ライン固定の3つ揃い（REPLAY / BELL / WATERMELON / SEVEN / SKULL / TRIPLE_CHERRY）生成 */
function buildAlignedSpin(
  role:
    | 'SEVEN'
    | 'TRIPLE_CHERRY'
    | 'WATERMELON'
    | 'BELL'
    | 'REPLAY'
    | 'SKULL',
  symbol: SlotSymbol,
  lineCandidates: readonly PaylineId[],
  momentum: SlotMomentum,
  rng: () => number,
): SlotSpinResult {
  const line = pickFrom(lineCandidates, rng);
  const [r0, r1, r2] = PAYLINES[line];

  const allowSevenInGrid = role === 'SEVEN';

  const safeFiller = (pos: 0 | 1 | 2, colOffset: number): ReelColumn => {
    const order: SlotSymbol[] = ['BELL', 'REPLAY', 'BAR', 'WATERMELON'];
    const filtered = order.filter((s) => s !== symbol);
    const res: SlotSymbol[] = [symbol, symbol, symbol];
    let p = 0;
    for (const row of [0, 1, 2] as const) {
      if (row !== pos) {
        res[row] = filtered[(p + colOffset) % filtered.length];
        p += 1;
      }
    }
    return res as ReelColumn;
  };
  const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
    safeFiller(r0, 0),
    safeFiller(r1, 1),
    safeFiller(r2, 2),
  ];

  const reels = generateValidReels(
    {
      role,
      expectedLine: line,
      expectedSymbol: symbol,
      fixedCols: [{ [r0]: symbol }, { [r1]: symbol }, { [r2]: symbol }],
      allowCherryInLeft: role === 'TRIPLE_CHERRY',
      allowCherryInMidRight: role === 'TRIPLE_CHERRY',
      allowSevenInGrid,
    },
    rng,
    fallback,
  );

  return {
    role,
    label: ROLE_LABELS[role],
    reels,
    winningLines: [line],
    highlightCells: cellsOnLine(line),
    momentum,
  };
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
 * 勢いに応じた1回転分のスロット出目を厳密5ラインルールで抽選・生成する
 */
export function rollSlotSpin(
  momentum: SlotMomentum,
  rng: () => number = Math.random,
): SlotSpinResult {
  const role = pickRoleByMomentum(momentum, rng());
  return buildSpinByRole(role, momentum, rng);
}

/**
 * 指定された役の出目を厳密5ラインルールで生成する共通ビルダー
 */
function buildSpinByRole(
  role: SlotRole,
  momentum: SlotMomentum,
  rng: () => number,
): SlotSpinResult {
  switch (role) {
    case 'MISS': {
      const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
        ['BELL', 'BAR', 'REPLAY'],
        ['REPLAY', 'WATERMELON', 'BAR'],
        ['WATERMELON', 'REPLAY', 'BELL'],
      ];
      const reels = generateValidReels(
        {
          role: 'MISS',
          fixedCols: [{}, {}, {}],
          allowCherryInLeft: false,
          allowCherryInMidRight: true,
          allowSevenInGrid: momentum !== 'toward_lose',
        },
        rng,
        fallback,
      );
      return {
        role: 'MISS',
        label: ROLE_LABELS.MISS,
        reels,
        winningLines: [],
        highlightCells: [],
        momentum,
      };
    }

    case 'REPLAY':
      return buildAlignedSpin('REPLAY', 'REPLAY', ALL_PAYLINE_IDS, momentum, rng);

    case 'BELL':
      return buildAlignedSpin('BELL', 'BELL', ALL_PAYLINE_IDS, momentum, rng);

    case 'WATERMELON':
      return buildAlignedSpin(
        'WATERMELON',
        'WATERMELON',
        ALL_PAYLINE_IDS,
        momentum,
        rng,
      );

    case 'TRIPLE_CHERRY':
      return buildAlignedSpin(
        'TRIPLE_CHERRY',
        'CHERRY',
        TRIPLE_CHERRY_LINES,
        momentum,
        rng,
      );

    case 'WEAK_CHERRY': {
      // 角チェリー：左リール上段(0)または下段(2)にチェリー（どこに止まっても成立）
      const row: 0 | 2 = rng() < 0.5 ? 0 : 2;
      const fallback: [ReelColumn, ReelColumn, ReelColumn] =
        row === 0
          ? [
              ['CHERRY', 'BELL', 'REPLAY'],
              ['REPLAY', 'BAR', 'BELL'],
              ['BAR', 'REPLAY', 'WATERMELON'],
            ]
          : [
              ['REPLAY', 'BELL', 'CHERRY'],
              ['REPLAY', 'BAR', 'BELL'],
              ['BAR', 'REPLAY', 'WATERMELON'],
            ];
      const reels = generateValidReels(
        {
          role: 'WEAK_CHERRY',
          expectedLeftCherryRow: row,
          fixedCols: [{ [row]: 'CHERRY' }, {}, {}],
          allowCherryInLeft: true,
          allowCherryInMidRight: false,
          allowSevenInGrid: true,
        },
        rng,
        fallback,
      );
      const lines: PaylineId[] =
        row === 0 ? ['TOP', 'DIAG_DOWN'] : ['BOT', 'DIAG_UP'];
      return {
        role: 'WEAK_CHERRY',
        label: ROLE_LABELS.WEAK_CHERRY,
        reels,
        winningLines: lines,
        highlightCells: [{ reel: 0, row }],
        momentum,
      };
    }

    case 'CHANCE_EYE': {
      // チャンス目：スイカテンパイハズレ（スイカより強い小役扱い）
      const line = pickFrom(ALL_PAYLINE_IDS, rng);
      const [r0, r1, r2] = PAYLINES[line];
      const rightBreak: SlotSymbol = rng() < 0.5 ? 'BAR' : 'BELL';
      const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
        (['WATERMELON', 'BAR', 'REPLAY'] as const).map((_, i) =>
          i === r0 ? 'WATERMELON' : i === (r0 + 1) % 3 ? 'BELL' : 'REPLAY',
        ) as ReelColumn,
        (['WATERMELON', 'REPLAY', 'BELL'] as const).map((_, i) =>
          i === r1 ? 'WATERMELON' : i === (r1 + 1) % 3 ? 'REPLAY' : 'BAR',
        ) as ReelColumn,
        (['BAR', 'BELL', 'REPLAY'] as const).map((_, i) =>
          i === r2 ? 'BAR' : i === (r2 + 1) % 3 ? 'BELL' : 'REPLAY',
        ) as ReelColumn,
      ];
      const reels = generateValidReels(
        {
          role: 'CHANCE_EYE',
          expectedLine: line,
          fixedCols: [
            { [r0]: 'WATERMELON' },
            { [r1]: 'WATERMELON' },
            { [r2]: rightBreak },
          ],
          allowCherryInLeft: false,
          allowCherryInMidRight: false,
          allowSevenInGrid: false,
        },
        rng,
        fallback,
      );
      return {
        role: 'CHANCE_EYE',
        label: ROLE_LABELS.CHANCE_EYE,
        reels,
        winningLines: [line],
        highlightCells: [
          { reel: 0, row: r0 },
          { reel: 1, row: r1 },
        ],
        momentum,
      };
    }

    default:
      return createIdleSpin();
  }
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
  const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
    ['BAR', 'CHERRY', 'REPLAY'],
    ['REPLAY', 'BAR', 'BELL'],
    ['BELL', 'REPLAY', 'BAR'],
  ];
  const reels = generateValidReels(
    {
      role: 'MID_CHERRY',
      expectedLeftCherryRow: 1,
      fixedCols: [{ 1: 'CHERRY' }, {}, {}],
      allowCherryInLeft: true,
      allowCherryInMidRight: false,
      allowSevenInGrid: true,
    },
    rng,
    fallback,
  );
  return {
    role: 'MID_CHERRY',
    label: ROLE_LABELS.MID_CHERRY,
    reels,
    winningLines: ['MID'],
    highlightCells: [{ reel: 0, row: 1 }],
    momentum: 'fast_win',
  };
}

/** 勝ち確定時の確定リーチ目（中段 リプレイ・リプレイ・7）を生成 */
export function createReachEyeWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
    ['BELL', 'REPLAY', 'BAR'],
    ['BAR', 'REPLAY', 'WATERMELON'],
    ['REPLAY', 'SEVEN', 'BELL'],
  ];
  const reels = generateValidReels(
    {
      role: 'REACH_EYE',
      fixedCols: [{ 1: 'REPLAY' }, { 1: 'REPLAY' }, { 1: 'SEVEN' }],
      allowCherryInLeft: false,
      allowCherryInMidRight: true,
      allowSevenInGrid: true,
    },
    rng,
    fallback,
  );
  return {
    role: 'REACH_EYE',
    label: ROLE_LABELS.REACH_EYE,
    reels,
    winningLines: ['MID'],
    highlightCells: [
      { reel: 0, row: 1 },
      { reel: 1, row: 1 },
      { reel: 2, row: 1 },
    ],
    momentum: 'fast_win',
  };
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

/** 勝ち確定時（次回転・直当たり）の 中段 7・7・7 出目を生成（BONUS確定） */
export function createSevenWinSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildAlignedSpin('SEVEN', 'SEVEN', MAIN_WIN_LINES, 'fast_win', rng);
}

/** 負け確定前兆のドクロ2個以上非揃い出目を生成 */
export function createSkullOmenLoseSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  const fixedCols: [FixedSpec, FixedSpec, FixedSpec] = [{}, {}, {}];
  const highlightCells: GridCell[] = [];

  if (rng() < 0.7) {
    // 2個配置（3リールから2本選び、各リールの任意段へ1つずつ配置）
    const pairs: readonly [0 | 1 | 2, 0 | 1 | 2][] = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    const [cA, cB] = pickFrom(pairs, rng);
    const rA = Math.floor(rng() * 3) as 0 | 1 | 2;
    const rB = Math.floor(rng() * 3) as 0 | 1 | 2;
    fixedCols[cA][rA] = 'SKULL';
    fixedCols[cB][rB] = 'SKULL';
    highlightCells.push({ reel: cA, row: rA }, { reel: cB, row: rB });
  } else {
    // 3個バラケ配置（5ラインのどこにも3つ揃いにならない組み合わせ）
    const nonAlignedTriples: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2][] = [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 2],
      [2, 0, 1],
      [2, 2, 1],
      [1, 2, 0],
    ];
    const [r0, r1, r2] = pickFrom(nonAlignedTriples, rng);
    fixedCols[0][r0] = 'SKULL';
    fixedCols[1][r1] = 'SKULL';
    fixedCols[2][r2] = 'SKULL';
    highlightCells.push(
      { reel: 0, row: r0 },
      { reel: 1, row: r1 },
      { reel: 2, row: r2 },
    );
  }

  const fallback: [ReelColumn, ReelColumn, ReelColumn] = [
    ['SKULL', 'BELL', 'REPLAY'],
    ['REPLAY', 'BAR', 'SKULL'],
    ['WATERMELON', 'REPLAY', 'BELL'],
  ];

  const reels = generateValidReels(
    {
      role: 'SKULL_OMEN',
      fixedCols,
      allowCherryInLeft: false,
      allowCherryInMidRight: false,
      allowSevenInGrid: false,
    },
    rng,
    fallback,
  );

  // フォールバックへ落ちた場合も実際の SKULL 位置と一致させる
  const actualHighlightCells: GridCell[] = [];
  for (const reel of [0, 1, 2] as const) {
    for (const row of [0, 1, 2] as const) {
      if (reels[reel][row] === 'SKULL') {
        actualHighlightCells.push({ reel, row });
      }
    }
  }

  return {
    role: 'SKULL_OMEN',
    label: ROLE_LABELS.SKULL_OMEN,
    reels,
    winningLines: [],
    highlightCells:
      actualHighlightCells.length >= 2 ? actualHighlightCells : highlightCells,
    momentum: 'toward_lose',
  };
}

/** 負け確定時の 中段 ドクロ・ドクロ・ドクロ 出目を生成 */
export function createSkullLoseSpin(
  rng: () => number = Math.random,
): SlotSpinResult {
  return buildAlignedSpin(
    'SKULL',
    'SKULL',
    SKULL_LINES,
    'toward_lose',
    rng,
  );
}

/** ポジション未保有時の待機出目を生成（7テンパイを含まないクリーンな出目） */
export function createIdleSpin(): SlotSpinResult {
  const reels: [ReelColumn, ReelColumn, ReelColumn] = [
    ['BELL', 'BAR', 'REPLAY'],
    ['REPLAY', 'SEVEN', 'BELL'],
    ['WATERMELON', 'BAR', 'REPLAY'],
  ];
  return {
    role: 'MISS',
    label: '',
    reels,
    winningLines: [],
    highlightCells: [],
    momentum: 'stagnant',
  };
}
