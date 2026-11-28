import {
  classifyMomentum,
  createMidCherryWinSpin,
  createRareTriggerWinSpin,
  createReachEyeWinSpin,
  createSevenWinSpin,
  createSkullLoseSpin,
  createSkullOmenLoseSpin,
  rollLoseSequencePattern,
  rollSlotSpin,
  rollWinSequencePattern,
  type SlotRole,
  type SlotSpinResult,
} from './slotEngine.ts';

/** 通常回転: 回転開始から左リール停止までの時間（ms） */
export const NORMAL_LEFT_STOP_MS = 750;
/** 通常回転: 左リール停止から中リール停止までの時間（ms） */
export const NORMAL_LEFT_TO_MID_MS = 270;
/** 通常回転: 左リール停止から右リール停止までの時間（ms） */
export const NORMAL_LEFT_TO_RIGHT_MS = 550;
/** 通常回転: 全リール停止後の出目表示維持時間（ms） */
export const NORMAL_DISPLAY_DWELL_MS = 1700;

/** 7揃い: 2回転目（または待機からの直当たり）で回転開始〜左停止までの時間（ms） */
export const SEVEN_SPIN_LEFT_STOP_MS = 650;
/** 7揃い: 左リール停止〜中リール停止（タン・タンの少しゆっくり目な間）（ms） */
export const SEVEN_LEFT_TO_MID_MS = 600;
/** 7揃い: 左リール停止〜右リール停止（中停止から +1050ms の溜め）（ms） */
export const SEVEN_LEFT_TO_RIGHT_MS = 1650;
/** 7揃い: 右リール停止バウンス完了後に全画面祝福演出・ファンファーレを発火する遅延（ms） */
export const SEVEN_RIGHT_TO_CELEBRATE_MS = 240;
/** 7揃い: 右リール停止から決着ダイアログ遷移までの余韻時間（ms） */
export const SEVEN_RIGHT_TO_COMPLETE_MS = 2650;

/** タイマーハンドル型（ブラウザ・Nodeテスト環境共通） */
export type TimerHandle = ReturnType<typeof setTimeout>;

/** 筐体演出フェーズ */
export type SlotLocalPhase =
  | 'idle'
  | 'mid_cherry'
  | 'reach_eye'
  | 'seven'
  | 'skull_omen'
  | 'skull';

/** 効果音・ラインフラッシュを伴う小役種別 */
export type SlotSpinRoleHit =
  | 'MID_CHERRY'
  | 'TRIPLE_CHERRY'
  | 'CHANCE_EYE'
  | 'WATERMELON'
  | 'WEAK_CHERRY'
  | 'BELL'
  | 'REPLAY';

/** シーケンサー内部状態 */
export type SequencerMode =
  | 'idle'
  | 'normal_spinning_before_left'
  | 'normal_stopping'
  | 'normal_displaying'
  | 'settlement_running';

/** 親コンポーネントから同期される状態入力 */
export interface SlotSequencerInput {
  positionId: string | null;
  hasPendingWin: boolean;
  hasPendingLose: boolean;
  hasSettlement: boolean;
}

/** テスト時に仮想クロックへ差し替え可能なタイマーAPI */
export interface SlotSequencerTimerApi {
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (id: TimerHandle) => void;
}

/** UI状態更新とサウンド再生を行うコールバック群 */
export interface SlotSequencerCallbacks {
  getProgress: () => number;
  getProgressDelta: () => number;
  onSpinResultChange: (result: SlotSpinResult) => void;
  onSpinningChange: (spinning: [boolean, boolean, boolean]) => void;
  onFlashPaylineChange: (flash: boolean) => void;
  onLocalPhaseChange: (phase: SlotLocalPhase) => void;
  onNormalCycleActiveChange?: (active: boolean) => void;
  onAppendHistory: (role: SlotRole) => void;
  onMidCherryActiveChange: (active: boolean) => void;
  onSevenAligned: () => void;
  onCompletePendingWin: () => void;
  onSkullAligned: () => void;
  onCompletePendingLose: () => void;
  playLeverOn: () => void;
  playReelStart: () => void;
  playReelStop: (isSeven: boolean) => void;
  playReelTenpai: () => void;
  playSlotRoleHit: (role: SlotSpinRoleHit) => void;
  playReachEye: () => void;
  playSkullOmen: () => void;
}

/** シーケンサー初期化オプション */
export interface SlotSequencerOptions {
  timers?: SlotSequencerTimerApi;
  rng?: () => number;
}

/** 小役ヒット演出対象か判定する型ガード */
function isSlotRoleHit(role: SlotRole): role is SlotSpinRoleHit {
  return (
    role === 'MID_CHERRY' ||
    role === 'TRIPLE_CHERRY' ||
    role === 'CHANCE_EYE' ||
    role === 'WATERMELON' ||
    role === 'WEAK_CHERRY' ||
    role === 'BELL' ||
    role === 'REPLAY'
  );
}

const DEFAULT_TIMERS: SlotSequencerTimerApi = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

/**
 * スロットの1回転サイクル（回転→順次停止→出目表示維持）を途中で切断せず
 * 自然に完結させてから決着演出へ移行するステートマシン
 */
export class SlotSpinSequencer {
  private readonly callbacks: SlotSequencerCallbacks;
  private readonly timers: SlotSequencerTimerApi;
  private readonly rng: () => number;
  private readonly activeTimers = new Set<TimerHandle>();

  private mode: SequencerMode = 'idle';
  private activePositionId: string | null = null;
  private disposed = false;
  private latestInput: SlotSequencerInput = {
    positionId: null,
    hasPendingWin: false,
    hasPendingLose: false,
    hasSettlement: false,
  };

  constructor(
    callbacks: SlotSequencerCallbacks,
    options: SlotSequencerOptions = {},
  ) {
    this.callbacks = callbacks;
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.rng = options.rng ?? Math.random;
  }

  /** 現在の内部モードを取得する（デバッグ・テスト用） */
  getMode(): SequencerMode {
    return this.mode;
  }

  /**
   * 最新のトレード状態を同期し、進行中の回転・出目表示を破壊しないよう遷移を制御する
   */
  sync(input: SlotSequencerInput): void {
    if (this.disposed) return;
    this.latestInput = { ...input };

    // 決着オーバーレイ表示中、またはモード切替/再接続でポジションが消失した場合は即停止
    const shouldForceReset =
      input.hasSettlement ||
      (!input.positionId && !input.hasPendingWin && !input.hasPendingLose);

    if (shouldForceReset) {
      if (this.mode !== 'idle') {
        this.resetToIdle();
      }
      return;
    }

    // 既に決着シーケンスが進行中なら完了までそのまま維持
    if (this.mode === 'settlement_running') {
      return;
    }

    // 通常サイクルが進行中の場合は、進行中の回転・出目表示を一切カットしない
    if (
      this.mode === 'normal_spinning_before_left' ||
      this.mode === 'normal_stopping' ||
      this.mode === 'normal_displaying'
    ) {
      // 通常運用では発生しないが、別ポジションへ直接切り替わった場合は安全に切り替え直す
      if (
        !input.hasPendingWin &&
        !input.hasPendingLose &&
        input.positionId !== null &&
        input.positionId !== this.activePositionId
      ) {
        this.resetToIdle();
        this.startNormalCycle(input.positionId);
      }
      return;
    }

    // idle からの開始判定
    if (input.hasPendingLose) {
      this.startLoseSequence(false);
      return;
    }

    if (input.hasPendingWin) {
      this.startWinSequence(false);
      return;
    }

    if (input.positionId) {
      this.startNormalCycle(input.positionId);
    }
  }

  /** 全タイマーを破棄してシーケンサーを終了する */
  dispose(): void {
    this.disposed = true;
    this.clearAllTimers();
    this.mode = 'idle';
    this.activePositionId = null;
  }

  /** 登録中の全タイマーを解除する */
  private clearAllTimers(): void {
    for (const id of this.activeTimers) {
      this.timers.clearTimeout(id);
    }
    this.activeTimers.clear();
  }

  /** 破棄ガード付きの単発タイマーをスケジュールする */
  private schedule(fn: () => void, delayMs: number): void {
    if (this.disposed) return;
    let id: TimerHandle;
    id = this.timers.setTimeout(() => {
      this.activeTimers.delete(id);
      if (this.disposed) return;
      fn();
    }, delayMs);
    this.activeTimers.add(id);
  }

  /** 強制リセットして待機状態へ戻す */
  private resetToIdle(): void {
    this.clearAllTimers();
    this.mode = 'idle';
    this.activePositionId = null;
    this.callbacks.onNormalCycleActiveChange?.(false);
    this.callbacks.onMidCherryActiveChange(false);
    this.callbacks.onLocalPhaseChange('idle');
    this.callbacks.onSpinningChange([false, false, false]);
    this.callbacks.onFlashPaylineChange(false);
  }

  /** 通常回転1サイクル（0ms回転開始 → 750ms左 → 1020ms中 → 1300ms右 → 3000ms次回転）を開始 */
  private startNormalCycle(positionId: string): void {
    this.clearAllTimers();
    this.mode = 'normal_spinning_before_left';
    this.activePositionId = positionId;

    this.callbacks.onNormalCycleActiveChange?.(true);
    this.callbacks.onLocalPhaseChange('idle');
    this.callbacks.onFlashPaylineChange(false);
    this.callbacks.onSpinningChange([true, true, true]);
    this.callbacks.playReelStart();

    // 左リール停止時点（750ms）まで待ってから、その時点の状況に応じて出目または決着へ分岐
    this.schedule(() => {
      // 左停止前に勝ち/負け確定へ入っていた場合は、回転を途切れさせずそのまま決着の1回転目として停止する
      if (this.latestInput.hasPendingLose) {
        this.callbacks.onNormalCycleActiveChange?.(false);
        this.startLoseSequence(true);
        return;
      }

      if (this.latestInput.hasPendingWin) {
        this.callbacks.onNormalCycleActiveChange?.(false);
        this.startWinSequence(true);
        return;
      }

      // 通常の左リール停止処理（停止直前の最新進捗速度・進捗率で抽選）
      this.mode = 'normal_stopping';
      const momentum = classifyMomentum(
        this.callbacks.getProgressDelta(),
        this.callbacks.getProgress(),
      );
      const rolled = rollSlotSpin(momentum, this.rng);
      this.callbacks.onSpinResultChange(rolled);
      this.callbacks.onSpinningChange([false, true, true]);
      this.callbacks.playReelStop(false);

      // 中リール停止（左停止から +270ms）
      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, true]);
        this.callbacks.playReelStop(false);
      }, NORMAL_LEFT_TO_MID_MS);

      // 右リール停止（左停止から +550ms）
      this.schedule(() => {
        this.mode = 'normal_displaying';
        this.callbacks.onSpinningChange([false, false, false]);
        this.callbacks.playReelStop(false);
        this.callbacks.onAppendHistory(rolled.role);
        if (isSlotRoleHit(rolled.role)) {
          this.callbacks.onFlashPaylineChange(true);
          this.callbacks.playSlotRoleHit(rolled.role);
        }

        // 出目表示を必ず 1700ms 維持してから次の回転を判断する
        this.schedule(() => {
          this.completeNormalCycle();
        }, NORMAL_DISPLAY_DWELL_MS);
      }, NORMAL_LEFT_TO_RIGHT_MS);
    }, NORMAL_LEFT_STOP_MS);
  }

  /** 通常回転1サイクル（出目表示維持を含む）完了後の次遷移 */
  private completeNormalCycle(): void {
    this.callbacks.onNormalCycleActiveChange?.(false);

    if (this.latestInput.hasSettlement) {
      this.resetToIdle();
      return;
    }

    if (this.latestInput.hasPendingLose) {
      this.startLoseSequence(false);
      return;
    }

    if (this.latestInput.hasPendingWin) {
      this.startWinSequence(false);
      return;
    }

    if (this.latestInput.positionId) {
      this.startNormalCycle(this.latestInput.positionId);
      return;
    }

    this.resetToIdle();
  }

  /** 負け確定シーケンス（ドクロ前兆50% / ダイレクトドクロ揃い50%）を実行 */
  private startLoseSequence(alreadySpinning: boolean): void {
    this.clearAllTimers();
    this.mode = 'settlement_running';
    this.activePositionId = null;

    const losePattern = rollLoseSequencePattern(this.rng);
    const skullSpin = createSkullLoseSpin(this.rng);

    const runSkullStopFromLeft = () => {
      this.callbacks.onSpinResultChange(skullSpin);
      this.callbacks.onSpinningChange([false, true, true]);
      this.callbacks.playReelStop(false);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, true]);
        this.callbacks.playReelStop(false);
      }, 400);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, false]);
        this.callbacks.onFlashPaylineChange(true);
        this.callbacks.onLocalPhaseChange('skull');
        this.callbacks.onAppendHistory('SKULL');
        this.callbacks.onSkullAligned();
      }, 900);

      this.schedule(() => {
        this.mode = 'idle';
        this.activePositionId = null;
        this.callbacks.onLocalPhaseChange('idle');
        this.callbacks.onFlashPaylineChange(false);
        this.callbacks.onCompletePendingLose();
      }, 2400);
    };

    if (losePattern === 'direct_skull') {
      this.dispatchFirstSpin(
        alreadySpinning,
        skullSpin,
        350,
        false,
        runSkullStopFromLeft,
      );
      return;
    }

    // ドクロ前兆（2個以上停止）→ 次回転で中段ドクロ揃い
    const omenSpin = createSkullOmenLoseSpin(this.rng);

    const runOmenStopFromLeft = () => {
      this.callbacks.onSpinResultChange(omenSpin);
      this.callbacks.onSpinningChange([false, true, true]);
      this.callbacks.playReelStop(false);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, true]);
        this.callbacks.playReelStop(false);
      }, 330);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, false]);
        this.callbacks.onLocalPhaseChange('skull_omen');
        this.callbacks.playSkullOmen();
      }, 680);

      // 2回転目: ドクロ揃い（左停止から +2080ms 後にレバーON回転開始）
      this.schedule(() => {
        this.callbacks.onLocalPhaseChange('idle');
        this.callbacks.onSpinResultChange(skullSpin);
        this.callbacks.onSpinningChange([true, true, true]);
        this.callbacks.onFlashPaylineChange(false);
        this.callbacks.playLeverOn();
        this.callbacks.playReelStart();

        this.schedule(() => {
          runSkullStopFromLeft();
        }, 350);
      }, 2080);
    };

    this.dispatchFirstSpin(
      alreadySpinning,
      omenSpin,
      320,
      false,
      runOmenStopFromLeft,
    );
  }

  /** 決着シーケンス1回転目の開始（既に回転中の場合は左停止から継続） */
  private dispatchFirstSpin(
    alreadySpinning: boolean,
    spin: SlotSpinResult,
    leftDelayMs: number,
    resetMidCherry: boolean,
    runFromLeft: () => void,
  ): void {
    if (resetMidCherry) {
      this.callbacks.onMidCherryActiveChange(false);
    }
    if (alreadySpinning) {
      runFromLeft();
      return;
    }
    this.callbacks.onLocalPhaseChange('idle');
    this.callbacks.onSpinResultChange(spin);
    this.callbacks.onSpinningChange([true, true, true]);
    this.callbacks.onFlashPaylineChange(false);
    this.callbacks.playReelStart();

    this.schedule(runFromLeft, leftDelayMs);
  }

  /** 勝ち確定シーケンス（中段チェリー / 突然7揃い / リーチ目 / 通常レア役 各25%）を実行 */
  private startWinSequence(alreadySpinning: boolean): void {
    this.clearAllTimers();
    this.mode = 'settlement_running';
    this.activePositionId = null;

    const winPattern = rollWinSequencePattern(this.rng);
    const sevenSpin = createSevenWinSpin(this.rng);

    const runSevenStopFromLeft = () => {
      this.callbacks.onSpinResultChange(sevenSpin);
      this.callbacks.onSpinningChange([false, true, true]);
      this.callbacks.playReelStop(true);

      // 中停止（左停止から +600ms：タン・タンの重厚な間）
      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, true]);
        this.callbacks.playReelTenpai();
      }, SEVEN_LEFT_TO_MID_MS);

      // 右停止（左停止から +1650ms、中停止から +1050ms 溜めて停止）
      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, false]);
        this.callbacks.playReelStop(true);
        this.callbacks.onFlashPaylineChange(true);
        this.callbacks.onLocalPhaseChange('seven');
        this.callbacks.onAppendHistory('SEVEN');
      }, SEVEN_LEFT_TO_RIGHT_MS);

      // 右リールのビタ止めバウンス完了後に全画面祝福演出とファンファーレを発火（フレーム落ち防止）
      this.schedule(() => {
        this.callbacks.onSevenAligned();
      }, SEVEN_LEFT_TO_RIGHT_MS + SEVEN_RIGHT_TO_CELEBRATE_MS);

      // 7揃いの余韻後に決着ダイアログへ遷移
      this.schedule(() => {
        this.mode = 'idle';
        this.activePositionId = null;
        this.callbacks.onLocalPhaseChange('idle');
        this.callbacks.onFlashPaylineChange(false);
        this.callbacks.onCompletePendingWin();
      }, SEVEN_LEFT_TO_RIGHT_MS + SEVEN_RIGHT_TO_COMPLETE_MS);
    };

    const startSecondSpinSeven = () => {
      this.callbacks.onLocalPhaseChange('idle');
      this.callbacks.onMidCherryActiveChange(false);
      this.callbacks.onSpinResultChange(sevenSpin);
      this.callbacks.onSpinningChange([true, true, true]);
      this.callbacks.onFlashPaylineChange(false);
      this.callbacks.playLeverOn();
      this.callbacks.playReelStart();

      this.schedule(runSevenStopFromLeft, SEVEN_SPIN_LEFT_STOP_MS);
    };

    // パターンA: 突然7揃い（25%）
    if (winPattern === 'direct_seven') {
      this.dispatchFirstSpin(
        alreadySpinning,
        sevenSpin,
        SEVEN_SPIN_LEFT_STOP_MS,
        true,
        runSevenStopFromLeft,
      );
      return;
    }

    // パターンB: 中段チェリー → 次回転7揃い（25%）
    if (winPattern === 'mid_cherry') {
      const midCherrySpin = createMidCherryWinSpin(this.rng);

      const runMidCherryFromLeft = () => {
        this.callbacks.onSpinResultChange(midCherrySpin);
        this.callbacks.onSpinningChange([false, true, true]);
        this.callbacks.playReelStop(true);

        this.schedule(() => {
          this.callbacks.onSpinningChange([false, false, true]);
          this.callbacks.playReelStop(false);
        }, 350);

        this.schedule(() => {
          this.callbacks.onSpinningChange([false, false, false]);
          this.callbacks.onFlashPaylineChange(true);
          this.callbacks.onLocalPhaseChange('mid_cherry');
          this.callbacks.onAppendHistory('MID_CHERRY');
          this.callbacks.playSlotRoleHit('MID_CHERRY');
          this.callbacks.onMidCherryActiveChange(true);
        }, 700);

        this.schedule(() => {
          startSecondSpinSeven();
        }, 2200);
      };

      this.dispatchFirstSpin(
        alreadySpinning,
        midCherrySpin,
        350,
        true,
        runMidCherryFromLeft,
      );
      return;
    }

    // パターンC: 確定リーチ目 → 次回転7揃い（25%）
    if (winPattern === 'reach_eye') {
      const reachSpin = createReachEyeWinSpin(this.rng);

      const runReachEyeFromLeft = () => {
        this.callbacks.onSpinResultChange(reachSpin);
        this.callbacks.onSpinningChange([false, true, true]);
        this.callbacks.playReelStop(false);

        this.schedule(() => {
          this.callbacks.onSpinningChange([false, false, true]);
          this.callbacks.playReelStop(false);
        }, 350);

        this.schedule(() => {
          this.callbacks.onSpinningChange([false, false, false]);
          this.callbacks.onLocalPhaseChange('reach_eye');
          this.callbacks.onAppendHistory('REACH_EYE');
          this.callbacks.playReachEye();
        }, 750);

        this.schedule(() => {
          startSecondSpinSeven();
        }, 2350);
      };

      this.dispatchFirstSpin(
        alreadySpinning,
        reachSpin,
        350,
        true,
        runReachEyeFromLeft,
      );
      return;
    }

    // パターンD: 通常レア役（角チェリー/スイカ/チャンス目/3連チェリー）→ 次回転7揃い（25%）
    const rareSpin = createRareTriggerWinSpin(this.rng);

    const runRareTriggerFromLeft = () => {
      this.callbacks.onSpinResultChange(rareSpin);
      this.callbacks.onSpinningChange([false, true, true]);
      this.callbacks.playReelStop(false);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, true]);
        this.callbacks.playReelStop(false);
      }, 350);

      this.schedule(() => {
        this.callbacks.onSpinningChange([false, false, false]);
        this.callbacks.onAppendHistory(rareSpin.role);
        if (isSlotRoleHit(rareSpin.role)) {
          this.callbacks.onFlashPaylineChange(true);
          this.callbacks.playSlotRoleHit(rareSpin.role);
        }
      }, 700);

      this.schedule(() => {
        startSecondSpinSeven();
      }, 2200);
    };

    this.dispatchFirstSpin(
      alreadySpinning,
      rareSpin,
      350,
      true,
      runRareTriggerFromLeft,
    );
  }
}
