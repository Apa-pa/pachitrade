/**
 * 外部音声ファイルを使用せず Web Audio API のみでパチスロ風効果音を生成するエンジン
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  /** AudioContext とマスターゲインを遅延初期化する */
  private ensureContext(): { ctx: AudioContext; master: GainNode } | null {
    if (typeof window === 'undefined') return null;

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.75;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // 自動再生制限下のエラーは無視
      });
    }

    if (!this.masterGain) return null;
    return { ctx: this.ctx, master: this.masterGain };
  }

  /** ホワイトノイズバッファを生成（メカニカル音・打撃音用） */
  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * ユーザー操作（ボタン押下など）時に呼び出して AudioContext をアンロックする
   */
  unlock(): void {
    this.ensureContext();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.75,
        this.ctx.currentTime,
        0.015,
      );
    }
  }

  private canPlay(): { ctx: AudioContext; master: GainNode } | null {
    if (this.muted) return null;
    return this.ensureContext();
  }

  /** 単音エンベロープ付きオシレータのヘルパー */
  private playTone(
    ctx: AudioContext,
    dest: AudioNode,
    options: {
      type: OscillatorType;
      startFreq: number;
      endFreq?: number;
      startTime: number;
      duration: number;
      peakGain: number;
      attack?: number;
    },
  ): void {
    const {
      type,
      startFreq,
      endFreq,
      startTime,
      duration,
      peakGain,
      attack = 0.008,
    } = options;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFreq),
        startTime + duration,
      );
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /**
   * 1. スロットのレバーON風SE（メカニカルクリック＋電子起動音）
   */
  playLeverOn(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // 短いバンドパスノイズでカチッという物理レバー感を出す
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, now);
      filter.Q.setValueAtTime(3.2, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.35, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(master);
      noise.start(now);
      noise.stop(now + 0.05);
    }

    // 重みのあるクリック低音 + 電子確認音
    this.playTone(ctx, master, {
      type: 'triangle',
      startFreq: 210,
      endFreq: 75,
      startTime: now,
      duration: 0.07,
      peakGain: 0.35,
      attack: 0.003,
    });
    this.playTone(ctx, master, {
      type: 'square',
      startFreq: 520,
      endFreq: 980,
      startTime: now + 0.02,
      duration: 0.09,
      peakGain: 0.14,
      attack: 0.005,
    });
  }

  /**
   * 2. 先バレ演出「ポキューン！」（重低音ドロップ＋金属的FMスイープ＋エコー）
   */
  playSakibare(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // 重低音サブベースドロップ（150Hz → 38Hz）
    this.playTone(ctx, master, {
      type: 'sine',
      startFreq: 150,
      endFreq: 38,
      startTime: now,
      duration: 0.48,
      peakGain: 0.65,
      attack: 0.006,
    });

    // 金属的FMレゾナントスイープ（ポキューン！の核）
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const outGain = ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(320, now);
    carrier.frequency.exponentialRampToValueAtTime(1480, now + 0.09);
    carrier.frequency.exponentialRampToValueAtTime(1120, now + 0.55);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(460, now);
    modGain.gain.setValueAtTime(520, now);
    modGain.gain.exponentialRampToValueAtTime(40, now + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.Q.setValueAtTime(4.5, now);

    outGain.gain.setValueAtTime(0.001, now);
    outGain.gain.linearRampToValueAtTime(0.45, now + 0.015);
    outGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(filter);
    filter.connect(outGain);
    outGain.connect(master);

    // ショートエコー（残響感）
    const delay = ctx.createDelay();
    delay.delayTime.setValueAtTime(0.11, now);
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.28, now);
    outGain.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(master);

    mod.start(now);
    carrier.start(now);
    mod.stop(now + 0.68);
    carrier.stop(now + 0.68);
  }

  /**
   * 3. 鼓動音「ドクン」（+60%チャンス / +80%激アツ中）
   */
  playHeartbeat(intense: boolean): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;
    const vol = intense ? 0.42 : 0.28;
    const gap = intense ? 0.12 : 0.16;

    // 1拍目「ドッ」
    this.playTone(ctx, master, {
      type: 'sine',
      startFreq: intense ? 95 : 82,
      endFreq: 40,
      startTime: now,
      duration: 0.12,
      peakGain: vol,
      attack: 0.006,
    });
    // 2拍目「クン」
    this.playTone(ctx, master, {
      type: 'sine',
      startFreq: intense ? 115 : 96,
      endFreq: 46,
      startTime: now + gap,
      duration: 0.15,
      peakGain: vol * 0.85,
      attack: 0.006,
    });
  }

  /**
   * 4. 激アツ!! カットイン突入音
   */
  playGekiatsuCutin(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // 鋭い上昇スイープ
    this.playTone(ctx, master, {
      type: 'sawtooth',
      startFreq: 350,
      endFreq: 1960,
      startTime: now,
      duration: 0.22,
      peakGain: 0.24,
      attack: 0.008,
    });

    // パワーコードヒット（D5 - A5 - D6）
    const chord = [587.33, 880, 1174.66];
    for (const freq of chord) {
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: freq,
        startTime: now + 0.09,
        duration: 0.36,
        peakGain: 0.18,
        attack: 0.005,
      });
    }
  }

  /**
   * 5. ピンチ（-70%以下）警告音
   */
  playPinchWarning(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // 不協和な2連続アラート
    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.19;
      this.playTone(ctx, master, {
        type: 'sawtooth',
        startFreq: 240,
        endFreq: 170,
        startTime: start,
        duration: 0.15,
        peakGain: 0.18,
        attack: 0.008,
      });
      this.playTone(ctx, master, {
        type: 'square',
        startFreq: 339,
        endFreq: 240,
        startTime: start,
        duration: 0.15,
        peakGain: 0.1,
        attack: 0.008,
      });
    }
  }

  /**
   * 「キュイン！」単発生成ヘルパー
   */
  private triggerKyuin(
    ctx: AudioContext,
    master: AudioNode,
    startTime: number,
    duration = 0.34,
  ): void {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1950, startTime);
    osc.frequency.exponentialRampToValueAtTime(4200, startTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(5100, startTime + duration);

    // 高速ビブラートでパチンコ特有の甲高い揺れを作る
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(36, startTime);
    lfoGain.gain.setValueAtTime(220, startTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3400, startTime);
    filter.Q.setValueAtTime(2.5, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.32, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.start(startTime);
    lfo.start(startTime);
    osc.stop(startTime + duration + 0.02);
    lfo.stop(startTime + duration + 0.02);
  }

  /**
   * 6. 通常WIN（「キュイン！」＋祝砲アルペジオ）
   */
  playWin(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    this.triggerKyuin(ctx, master, now, 0.36);

    // Cメジャー9th アルペジオ
    const notes = [523.25, 659.25, 783.99, 1046.5, 1174.66];
    notes.forEach((freq, idx) => {
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: freq,
        startTime: now + 0.14 + idx * 0.075,
        duration: 0.42,
        peakGain: 0.22,
        attack: 0.008,
      });
    });
  }

  /**
   * 7. 逆転大当たり専用ファンファーレ（「キュイン！」3連＋勝利ファンファーレ和音進行）
   */
  playComebackWin(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // キュイン3連発
    this.triggerKyuin(ctx, master, now, 0.24);
    this.triggerKyuin(ctx, master, now + 0.19, 0.24);
    this.triggerKyuin(ctx, master, now + 0.38, 0.4);

    // 上昇グリッサンド
    this.playTone(ctx, master, {
      type: 'sawtooth',
      startFreq: 261.63,
      endFreq: 1567.98,
      startTime: now + 0.45,
      duration: 0.32,
      peakGain: 0.16,
      attack: 0.01,
    });

    // ファンファーレ旋律（G4 -> C5 -> E5 -> G5 -> C6）
    const melody = [
      { freq: 392.0, time: 0.72, dur: 0.14 },
      { freq: 523.25, time: 0.86, dur: 0.14 },
      { freq: 659.25, time: 1.0, dur: 0.16 },
      { freq: 783.99, time: 1.18, dur: 0.22 },
      { freq: 1046.5, time: 1.4, dur: 0.85 },
    ];
    for (const m of melody) {
      this.playTone(ctx, master, {
        type: 'sawtooth',
        startFreq: m.freq,
        startTime: now + m.time,
        duration: m.dur,
        peakGain: 0.17,
        attack: 0.01,
      });
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: m.freq * 0.5,
        startTime: now + m.time,
        duration: m.dur,
        peakGain: 0.22,
        attack: 0.01,
      });
    }

    // フィニッシュ重厚和音（Cメジャー）
    const finalChord = [523.25, 659.25, 783.99, 1046.5];
    for (const freq of finalChord) {
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: freq,
        startTime: now + 1.4,
        duration: 0.95,
        peakGain: 0.15,
        attack: 0.02,
      });
    }
  }

  /**
   * 8. LOSE（下降ピッチベンドの残念音・パワーダウン音）
   */
  playLose(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    const steps = [
      { start: 392.0, end: 329.63, time: 0, dur: 0.2 },
      { start: 329.63, end: 277.18, time: 0.18, dur: 0.22 },
      { start: 261.63, end: 110.0, time: 0.36, dur: 0.55 },
    ];
    for (const s of steps) {
      this.playTone(ctx, master, {
        type: 'sawtooth',
        startFreq: s.start,
        endFreq: s.end,
        startTime: now + s.time,
        duration: s.dur,
        peakGain: 0.18,
        attack: 0.01,
      });
    }
  }

  /**
   * 9. スロットリール回転開始音（軽快な電子モーター音）
   */
  playReelStart(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    this.playTone(ctx, master, {
      type: 'triangle',
      startFreq: 260,
      endFreq: 520,
      startTime: now,
      duration: 0.085,
      peakGain: 0.1,
      attack: 0.005,
    });
  }

  /**
   * 10. スロットリール停止音（「タンッ」、7停止時は重厚な「ドォン！」）
   */
  playReelStop(isSeven = false): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    if (isSeven) {
      this.playTone(ctx, master, {
        type: 'sine',
        startFreq: 190,
        endFreq: 52,
        startTime: now,
        duration: 0.18,
        peakGain: 0.42,
        attack: 0.003,
      });
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: 980,
        endFreq: 1320,
        startTime: now,
        duration: 0.11,
        peakGain: 0.2,
        attack: 0.003,
      });
      return;
    }

    this.playTone(ctx, master, {
      type: 'triangle',
      startFreq: 340,
      endFreq: 130,
      startTime: now,
      duration: 0.055,
      peakGain: 0.14,
      attack: 0.002,
    });
  }

  /**
   * 11. 7テンパイ音（左・中が7停止時の上昇2音）
   */
  playReelTenpai(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    this.playTone(ctx, master, {
      type: 'square',
      startFreq: 783.99,
      startTime: now,
      duration: 0.11,
      peakGain: 0.15,
      attack: 0.004,
    });
    this.playTone(ctx, master, {
      type: 'square',
      startFreq: 1174.66,
      startTime: now + 0.09,
      duration: 0.24,
      peakGain: 0.18,
      attack: 0.004,
    });
  }

  /**
   * 12. スロット小役成立音（役の強さに応じた演出音）
   */
  playSlotRoleHit(
    role:
      | 'MID_CHERRY'
      | 'TRIPLE_CHERRY'
      | 'CHANCE_EYE'
      | 'WATERMELON'
      | 'WEAK_CHERRY'
      | 'BELL'
      | 'REPLAY',
  ): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    if (role === 'MID_CHERRY') {
      // 最強レア役：重低音インパクト＋上昇煌めき和音
      this.playTone(ctx, master, {
        type: 'sine',
        startFreq: 130,
        endFreq: 42,
        startTime: now,
        duration: 0.35,
        peakGain: 0.48,
        attack: 0.004,
      });
      const notes = [659.25, 880, 1174.66, 1567.98, 2093];
      notes.forEach((freq, idx) => {
        this.playTone(ctx, master, {
          type: 'triangle',
          startFreq: freq,
          startTime: now + idx * 0.045,
          duration: 0.28,
          peakGain: 0.22,
          attack: 0.004,
        });
      });
      return;
    }

    if (role === 'TRIPLE_CHERRY') {
      // 3連チェリー：鋭い3連高音上昇＋輝かしいアルペジオ
      const notes = [783.99, 1046.5, 1318.51, 1567.98];
      notes.forEach((freq, idx) => {
        this.playTone(ctx, master, {
          type: 'sawtooth',
          startFreq: freq,
          startTime: now + idx * 0.05,
          duration: 0.22,
          peakGain: 0.14,
          attack: 0.004,
        });
      });
      return;
    }

    if (role === 'CHANCE_EYE') {
      // チャンス目（スイカテンパイハズレ）：フラッシュ衝撃音＋期待和音
      this.playTone(ctx, master, {
        type: 'sawtooth',
        startFreq: 420,
        endFreq: 1680,
        startTime: now,
        duration: 0.14,
        peakGain: 0.18,
        attack: 0.004,
      });
      [587.33, 880, 1174.66].forEach((freq) => {
        this.playTone(ctx, master, {
          type: 'triangle',
          startFreq: freq,
          startTime: now + 0.09,
          duration: 0.28,
          peakGain: 0.16,
          attack: 0.004,
        });
      });
      return;
    }

    if (role === 'WEAK_CHERRY' || role === 'WATERMELON') {
      const notes =
        role === 'WATERMELON'
          ? [659.25, 880, 1046.5, 1318.51]
          : [587.33, 783.99, 987.77];
      notes.forEach((freq, idx) => {
        this.playTone(ctx, master, {
          type: 'triangle',
          startFreq: freq,
          startTime: now + idx * 0.055,
          duration: 0.18,
          peakGain: 0.17,
          attack: 0.004,
        });
      });
      return;
    }

    if (role === 'BELL') {
      // 軽快なベル払出音「チャリン♪」
      this.playTone(ctx, master, {
        type: 'sine',
        startFreq: 1318.51,
        startTime: now,
        duration: 0.14,
        peakGain: 0.15,
        attack: 0.003,
      });
      this.playTone(ctx, master, {
        type: 'sine',
        startFreq: 1760,
        startTime: now + 0.06,
        duration: 0.18,
        peakGain: 0.16,
        attack: 0.003,
      });
      return;
    }

    // REPLAY「ピロリン♪」
    this.playTone(ctx, master, {
      type: 'triangle',
      startFreq: 698.46,
      startTime: now,
      duration: 0.1,
      peakGain: 0.13,
      attack: 0.004,
    });
    this.playTone(ctx, master, {
      type: 'triangle',
      startFreq: 932.33,
      startTime: now + 0.075,
      duration: 0.14,
      peakGain: 0.14,
      attack: 0.004,
    });
  }

  /**
   * 13. ドクロ揃い音（不気味な低音鐘・警告ダウン音）
   */
  playSkullAligned(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    this.playTone(ctx, master, {
      type: 'sawtooth',
      startFreq: 155.56,
      endFreq: 73.42,
      startTime: now,
      duration: 0.45,
      peakGain: 0.24,
      attack: 0.006,
    });
    this.playTone(ctx, master, {
      type: 'square',
      startFreq: 220,
      endFreq: 103.83,
      startTime: now,
      duration: 0.42,
      peakGain: 0.14,
      attack: 0.006,
    });
  }

  /**
   * 14. 確定リーチ目音（中段リプ・リプ・7 停止時の違和感＋高揚和音）
   */
  playReachEye(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    // 腹に響く「ドゥン」低音インパクト
    this.playTone(ctx, master, {
      type: 'sine',
      startFreq: 120,
      endFreq: 44,
      startTime: now,
      duration: 0.34,
      peakGain: 0.45,
      attack: 0.004,
    });

    // 澄んだ高音和音「キラーン♪」
    const sparkle = [1046.5, 1318.51, 1567.98, 2093.0];
    sparkle.forEach((freq, idx) => {
      this.playTone(ctx, master, {
        type: 'triangle',
        startFreq: freq,
        startTime: now + 0.05 + idx * 0.035,
        duration: 0.36,
        peakGain: 0.18,
        attack: 0.004,
      });
    });
  }

  /**
   * 15. ドクロ前兆音（2個以上停止時の不穏な警告スウェル音）
   */
  playSkullOmen(): void {
    const audio = this.canPlay();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    this.playTone(ctx, master, {
      type: 'sawtooth',
      startFreq: 110,
      endFreq: 82.41,
      startTime: now,
      duration: 0.36,
      peakGain: 0.16,
      attack: 0.04,
    });
    this.playTone(ctx, master, {
      type: 'sine',
      startFreq: 155.56,
      endFreq: 116.54,
      startTime: now + 0.04,
      duration: 0.32,
      peakGain: 0.14,
      attack: 0.03,
    });
  }
}

/** アプリ全体で共有する効果音エンジンインスタンス */
export const soundEngine = new SoundEngine();
