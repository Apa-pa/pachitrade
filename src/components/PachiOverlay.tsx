import { useEffect, useState } from 'react';
import type { InstrumentMeta } from '../feeds/index.ts';
import type { EffectPatternId } from '../game/effects.ts';
import type {
  EffectStage,
  SettlementResult,
  TradeOutcome,
} from '../game/types.ts';
import { FlameIcon, ZapIcon } from './Icons.tsx';

/** 7・7・7揃いの余韻を見せた後に BONUS 確定バナーを表示するまでの待機時間（ms） */
const BONUS_BANNER_DELAY_MS = 900;

interface PachiOverlayProps {
  effectPattern: EffectPatternId;
  effectStage: EffectStage;
  midCherryActive: boolean;
  sevenAligned: boolean;
  skullAligned: boolean;
  pendingWinOutcome: TradeOutcome | null;
  sakibareActive: boolean;
  settlement: SettlementResult | null;
  meta: InstrumentMeta;
  onDismissSettlement: () => void;
}

/**
 * 画面外枠のネオン発光・カットイン・先バレフラッシュ・BONUS確定・決着演出オーバーレイ
 */
export function PachiOverlay({
  effectPattern,
  effectStage,
  midCherryActive,
  sevenAligned,
  skullAligned,
  pendingWinOutcome,
  sakibareActive,
  settlement,
  meta,
  onDismissSettlement,
}: PachiOverlayProps) {
  const showNeonStage = effectPattern === 'neon' && !settlement;
  const shouldShowSevenWinOverlay =
    effectPattern === 'slot' && sevenAligned && !settlement;
  const [showBonusBanner, setShowBonusBanner] = useState(false);

  // 7揃い直後はリール上の7・7・7の余韻を見せ、少し遅らせて BONUS 確定バナーを表示する
  useEffect(() => {
    if (!shouldShowSevenWinOverlay) {
      setShowBonusBanner(false);
      return;
    }

    setShowBonusBanner(false);
    const timer = setTimeout(() => {
      setShowBonusBanner(true);
    }, BONUS_BANNER_DELAY_MS);

    return () => clearTimeout(timer);
  }, [shouldShowSevenWinOverlay]);

  return (
    <>
      {/* 1. ネオン演出選択時の画面外枠ネオン / ピンチ暗転レイヤー */}
      {showNeonStage && effectStage === 'blue_aura' && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 border-4 border-cyan-400/90 shadow-[inset_0_0_48px_rgba(34,211,238,0.6),inset_0_0_110px_rgba(59,130,246,0.3)] transition-all duration-300"
        />
      )}

      {showNeonStage && effectStage === 'chance' && (
        <div
          aria-hidden="true"
          className="animate-neon-green-red pointer-events-none fixed inset-0 z-30 border-[5px]"
        />
      )}

      {showNeonStage && effectStage === 'gekiatsu' && (
        <>
          <div
            aria-hidden="true"
            className="animate-neon-gekiatsu pointer-events-none fixed inset-0 z-30 border-[6px]"
          />
          {/* 激アツ!! 中央カットイン */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-1/3 z-30 flex -translate-y-1/2 justify-center px-4"
          >
            <div className="animate-cutin-slide relative overflow-hidden rounded-xl border-2 border-yellow-300 bg-gradient-to-r from-rose-700/95 via-amber-500/95 to-rose-700/95 px-8 py-3 shadow-[0_0_45px_rgba(250,204,21,0.85)]">
              <div className="flex items-center gap-2 text-2xl font-black tracking-widest text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] sm:text-4xl">
                <FlameIcon className="h-7 w-7 text-yellow-200 sm:h-9 sm:w-9" />
                <span>激アツ!!</span>
                <FlameIcon className="h-7 w-7 text-yellow-200 sm:h-9 sm:w-9" />
              </div>
              <p className="mt-0.5 text-center text-[11px] font-extrabold tracking-widest text-yellow-100">
                利確ライン目前!! リーチ!!
              </p>
            </div>
          </div>
        </>
      )}

      {showNeonStage && effectStage === 'pinch' && (
        <div
          aria-hidden="true"
          className="animate-pinch-vignette pointer-events-none fixed inset-0 z-30 border-4 border-rose-600/80"
        />
      )}

      {/* 1.4 スロット演出での確定役（中段チェリー降臨）：文字ネタバレなし・フラッシュ＆衝撃波のみ */}
      {effectPattern === 'slot' && midCherryActive && !sevenAligned && !settlement && (
        <div
          aria-hidden="true"
          data-testid="mid-cherry-fx"
          className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center overflow-hidden border-[6px] border-pink-400/95 shadow-[inset_0_0_80px_rgba(236,72,153,0.72),inset_0_0_150px_rgba(250,204,21,0.45)]"
        >
          {/* 瞬間閃光フラッシュ */}
          <div className="animate-mid-cherry-flash absolute inset-0 bg-radial from-amber-200/70 via-fuchsia-500/45 to-transparent" />
          {/* 2重のネオン衝撃波リング */}
          <div className="animate-shockwave-ring absolute h-56 w-56 rounded-full border-4 border-pink-300 shadow-[0_0_40px_rgba(236,72,153,0.9)]" />
          <div
            className="animate-shockwave-ring absolute h-40 w-40 rounded-full border-4 border-amber-300 shadow-[0_0_40px_rgba(250,204,21,0.9)]"
            style={{ animationDelay: '0.12s' }}
          />
        </div>
      )}

      {/* 1.5 スロット演出での777揃い時『BONUS 確定』派手演出 */}
      {shouldShowSevenWinOverlay && (
        <>
          <div
            aria-hidden="true"
            className="animate-rainbow-border pointer-events-none fixed inset-0 z-30 border-8"
          />
          {/* 放射状サンバースト光線（リールの7・7・7が見えやすいよう暗転なしで透過控えめ） */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center overflow-hidden"
          >
            <div
              className="animate-bonus-burst-spin h-[160vmax] w-[160vmax] opacity-30"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, rgba(250,204,21,0.38) 0deg 8deg, transparent 8deg 20deg, rgba(244,63,94,0.32) 20deg 26deg, transparent 26deg 40deg)',
              }}
            />
          </div>

          {/* BONUS 確定 バナー（余韻後に画面上部へ表示してリールを隠さない） */}
          {showBonusBanner && (
            <div
              aria-hidden="true"
              data-testid="bonus-kakutei-banner"
              className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center px-4 pt-12 sm:pt-16"
            >
              <div className="animate-bonus-banner-pop relative overflow-hidden rounded-2xl border-4 border-yellow-300 bg-gradient-to-b from-[#2b0918] via-[#13051c] to-[#2b0918] px-6 py-2.5 text-center shadow-[0_0_70px_rgba(250,204,21,0.9),inset_0_0_32px_rgba(244,63,94,0.6)] sm:px-12 sm:py-4">
                {/* 斜め光沢スイープ */}
                <div
                  aria-hidden="true"
                  className="animate-bonus-shine-sweep pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                />

                {pendingWinOutcome === 'COMEBACK_WIN' && (
                  <p className="relative mb-1 text-xs font-black tracking-[0.3em] text-yellow-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] sm:text-sm">
                    ⚡ 逆転 ⚡
                  </p>
                )}

                <p className="animate-rainbow-text relative text-2xl font-black tracking-wider drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)] sm:text-4xl">
                  BONUS 確定
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* 1.6 スロット演出でのドクロ揃い時・暗赤紫パルスのみ */}
      {effectPattern === 'slot' && skullAligned && !settlement && (
        <div
          aria-hidden="true"
          data-testid="skull-aligned-fx"
          className="animate-skull-pulse pointer-events-none fixed inset-0 z-30 border-4 border-purple-500/80"
        />
      )}

      {/* 2. 先バレ演出（約20%の確率で画面が一瞬赤くフラッシュ） */}
      {sakibareActive && (
        <div
          aria-hidden="true"
          className="animate-sakibare-flash pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-radial from-rose-500/50 via-red-600/75 to-red-950/90"
        >
          <div className="flex items-center gap-2 rounded-2xl border-2 border-rose-200 bg-red-700/90 px-8 py-4 text-3xl font-black tracking-widest text-white shadow-[0_0_60px_rgba(244,63,94,0.95)] sm:text-5xl">
            <ZapIcon className="h-8 w-8 text-yellow-300 sm:h-11 sm:w-11" />
            <span>先バレ!!</span>
          </div>
        </div>
      )}

      {/* 3. 決着オーバーレイ（WIN / 逆転大当たり / LOSE） */}
      {settlement && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="トレード決着結果"
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            settlement.outcome === 'LOSE'
              ? 'bg-slate-950/75'
              : 'animate-rainbow-border border-8 bg-slate-950/70'
          }`}
        >
          <div
            className={`relative w-full max-w-md overflow-hidden rounded-3xl border-2 p-6 text-center shadow-2xl sm:p-8 ${
              settlement.outcome === 'COMEBACK_WIN'
                ? 'border-yellow-300 bg-gradient-to-b from-[#1e1038] via-[#120b24] to-[#080a16] shadow-[0_0_70px_rgba(250,204,21,0.55)]'
                : settlement.outcome === 'WIN'
                  ? 'border-cyan-300 bg-gradient-to-b from-[#0d1f3a] via-[#091225] to-[#060913] shadow-[0_0_60px_rgba(34,211,238,0.45)]'
                  : 'border-slate-600 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_40px_rgba(0,0,0,0.8)]'
            }`}
          >
            {settlement.outcome === 'COMEBACK_WIN' && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-yellow-300/70 bg-gradient-to-r from-rose-600 via-amber-500 to-fuchsia-600 px-3 py-1 text-xs font-black tracking-widest text-white">
                <ZapIcon className="h-4 w-4 text-yellow-200" />
                <span>絶体絶命からの奇跡の復活!!</span>
              </div>
            )}

            <h2
              className={`text-3xl font-black tracking-wider sm:text-5xl ${
                settlement.outcome === 'LOSE'
                  ? 'text-slate-300'
                  : 'animate-rainbow-text drop-shadow-[0_0_16px_rgba(255,255,255,0.45)]'
              }`}
            >
              {settlement.outcome === 'COMEBACK_WIN'
                ? '★ 逆転大当たり!! ★'
                : settlement.outcome === 'WIN'
                  ? 'BIG WIN!!'
                  : 'LOSE...'}
            </h2>

            <p className="mt-2 text-xs font-semibold text-slate-300">
              {settlement.side} ({settlement.entryPrice.toFixed(meta.decimals)} →{' '}
              {settlement.exitPrice.toFixed(meta.decimals)} {meta.unit})
            </p>

            {/* 獲得・損失スコア */}
            <div className="my-5 rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-[11px] font-bold tracking-wider text-slate-400">
                {settlement.outcome === 'LOSE' ? '確定損失' : '獲得仮想収支'}
              </p>
              <p
                className={`mt-1 font-mono text-3xl font-black ${
                  settlement.outcome === 'LOSE'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {settlement.pnl >= 0 ? '+' : ''}
                {settlement.pnl.toFixed(meta.decimals)} {meta.unit}
              </p>

              {settlement.outcome !== 'LOSE' ? (
                <p className="mt-2 text-xs font-bold text-amber-300">
                  {settlement.streakAfter >= 2
                    ? `🔥 連勝中!! ${settlement.streakAfter}連!!`
                    : '🎯 1勝目！次も取って連勝を伸ばそう！'}
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  {settlement.previousStreak >= 2
                    ? `連勝ストップ（${settlement.previousStreak}連）… 切り替えて次を狙おう！`
                    : '惜しくも損切りライン到達… 次の波を狙おう！'}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onDismissSettlement}
              className={`cursor-pointer w-full rounded-xl py-3.5 text-sm font-black tracking-widest text-white transition-all active:scale-98 ${
                settlement.outcome === 'LOSE'
                  ? 'border border-slate-500 bg-slate-800 hover:bg-slate-700'
                  : 'bg-gradient-to-r from-fuchsia-600 via-amber-500 to-cyan-500 shadow-[0_0_24px_rgba(217,70,239,0.5)] hover:brightness-110'
              }`}
            >
              {settlement.outcome === 'LOSE' ? 'リベンジする' : '次の勝負へ'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
