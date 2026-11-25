import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type AutoscaleInfoProvider,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Candle, InstrumentMeta } from '../feeds/index.ts';
import type { Position } from '../game/types.ts';
import { formatIntervalLabel } from '../utils/priceFormat.ts';

interface PriceChartProps {
  initialCandles: Candle[];
  candlesRevision: number;
  latestCandle: Candle | null;
  currentPrice: number | null;
  prevPrice: number | null;
  meta: InstrumentMeta;
  position: Position | null;
  mobileMode?: 'normal' | 'mini';
  topRightSlot?: ReactNode;
  showSakibareBadge?: boolean;
}

interface LineLabelItem {
  key: 'tp' | 'entry' | 'sl';
  tag: string;
  priceText: string;
  y: number;
  className: string;
}

const MIN_LABEL_GAP_PX = 22;

function toChartCandle(c: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

export function PriceChart({
  initialCandles,
  candlesRevision,
  latestCandle,
  currentPrice,
  prevPrice,
  meta,
  position,
  mobileMode,
  topRightSlot,
  showSakibareBadge = false,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastCandleTimeRef = useRef<number | null>(null);
  const positionRef = useRef<Position | null>(position);
  const decimalsRef = useRef<number>(meta.decimals);
  const mobileModeRef = useRef<'normal' | 'mini' | undefined>(mobileMode);
  const rafRef = useRef<number | null>(null);

  const [lineLabels, setLineLabels] = useState<LineLabelItem[]>([]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    decimalsRef.current = meta.decimals;
  }, [meta.decimals]);

  useEffect(() => {
    mobileModeRef.current = mobileMode;
  }, [mobileMode]);

  /** チャート上の水平線（TP / ENTRY / SL）のY座標を計算し左端ラベルへ同期する */
  const syncLineLabels = useCallback(() => {
    const series = seriesRef.current;
    const container = containerRef.current;
    const pos = positionRef.current;
    if (!series || !container || !pos) {
      setLineLabels([]);
      return;
    }

    const isMini = mobileModeRef.current === 'mini';
    const minGap = isMini ? 18 : MIN_LABEL_GAP_PX;

    const fmtPrice = (val: number) =>
      val.toLocaleString('en-US', {
        minimumFractionDigits: decimalsRef.current,
        maximumFractionDigits: decimalsRef.current,
      });

    const candidates: Array<Omit<LineLabelItem, 'y'> & { rawY: number }> = [];
    const specs: Array<{
      key: LineLabelItem['key'];
      price: number;
      tag: string;
      className: string;
    }> = [
      {
        key: 'tp',
        price: pos.tpPrice,
        tag: isMini ? 'TP' : 'TP 利確',
        className:
          'border-emerald-500/75 bg-emerald-950/90 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.28)]',
      },
      {
        key: 'entry',
        price: pos.entryPrice,
        tag: isMini ? 'ENT' : `ENTRY (${pos.side})`,
        className:
          'border-slate-300/75 bg-slate-900/90 text-white shadow-[0_0_8px_rgba(255,255,255,0.18)]',
      },
      {
        key: 'sl',
        price: pos.slPrice,
        tag: isMini ? 'SL' : 'SL 損切',
        className:
          'border-rose-500/75 bg-rose-950/90 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.28)]',
      },
    ];

    for (const s of specs) {
      const coord = series.priceToCoordinate(s.price);
      if (typeof coord === 'number' && Number.isFinite(coord)) {
        candidates.push({
          key: s.key,
          tag: s.tag,
          priceText: isMini ? '' : fmtPrice(s.price),
          rawY: coord,
          className: s.className,
        });
      }
    }

    if (candidates.length === 0) {
      setLineLabels([]);
      return;
    }

    // Y座標の昇順に並べ、ラベル同士の重なりと上下はみ出しを防ぐ
    candidates.sort((a, b) => a.rawY - b.rawY);
    const height = container.clientHeight || 360;
    const minY = isMini ? 10 : 14;
    const maxY = Math.max(minY, height - (isMini ? 16 : 38));

    const placed: LineLabelItem[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let y = Math.max(minY, Math.min(maxY, c.rawY));
      if (i > 0 && y < placed[i - 1].y + minGap) {
        y = placed[i - 1].y + minGap;
      }
      placed.push({
        key: c.key,
        tag: c.tag,
        priceText: c.priceText,
        y,
        className: c.className,
      });
    }

    // 下端を超えた場合は上方向へ押し戻して重なりを防ぐ
    for (let i = placed.length - 1; i >= 0; i--) {
      if (placed[i].y > maxY) {
        placed[i].y = maxY;
      }
      if (i > 0 && placed[i - 1].y > placed[i].y - minGap) {
        placed[i - 1].y = Math.max(minY, placed[i].y - minGap);
      }
    }

    setLineLabels(placed);
  }, []);

  const scheduleSyncLabels = useCallback(
    (doubleFrame = false) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        syncLineLabels();
        if (doubleFrame) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            syncLineLabels();
          });
        } else {
          rafRef.current = null;
        }
      });
    },
    [syncLineLabels],
  );

  // チャート本体・シリーズ初期化（マウント時1回）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth || 640,
      height: container.clientHeight || 420,
      layout: {
        background: { type: ColorType.Solid, color: '#070b14' },
        textColor: '#94a3b8',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(51, 65, 85, 0.28)' },
        horzLines: { color: 'rgba(51, 65, 85, 0.28)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(34, 211, 238, 0.45)',
          labelBackgroundColor: '#0f172a',
        },
        horzLine: {
          color: 'rgba(34, 211, 238, 0.45)',
          labelBackgroundColor: '#0f172a',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(71, 85, 105, 0.45)',
        scaleMargins:
          mobileModeRef.current === 'mini'
            ? { top: 0.08, bottom: 0.08 }
            : { top: 0.14, bottom: 0.14 },
      },
      timeScale: {
        visible: mobileModeRef.current !== 'mini',
        borderColor: 'rgba(71, 85, 105, 0.45)',
        timeVisible: true,
        secondsVisible: true,
        rightOffsetPixels: mobileModeRef.current === 'mini' ? 24 : 56,
      },
    });

    const autoscaleProvider: AutoscaleInfoProvider = (baseImplementation) => {
      const res = baseImplementation();
      const pos = positionRef.current;
      if (!res || !res.priceRange || !pos) return res;

      const lowBound = Math.min(pos.tpPrice, pos.slPrice);
      const highBound = Math.max(pos.tpPrice, pos.slPrice);
      const pad = Math.max(pos.targetWidth * 0.18, 2);

      return {
        ...res,
        priceRange: {
          minValue: Math.min(res.priceRange.minValue, lowBound - pad),
          maxValue: Math.max(res.priceRange.maxValue, highBound + pad),
        },
      };
    };

    // lightweight-charts v5 記法でローソク足シリーズを追加
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#34d399',
      borderDownColor: '#fb7185',
      wickUpColor: '#34d399',
      wickDownColor: '#fb7185',
      priceFormat: {
        type: 'price',
        precision: meta.decimals,
        minMove: 1 / 10 ** meta.decimals,
      },
      // エントリー中は TP / SL の3本ラインが必ず縦軸に収まるよう拡張する
      autoscaleInfoProvider: autoscaleProvider,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleRangeChange = () => {
      scheduleSyncLabels(false);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    const handleWheel = () => scheduleSyncLabels(true);
    const handlePointerMove = (e: PointerEvent) => {
      if (e.buttons > 0) {
        scheduleSyncLabels(false);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({
          width: Math.floor(width),
          height: Math.floor(height),
        });
        scheduleSyncLabels(true);
      }
    });
    observer.observe(container);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointermove', handlePointerMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      observer.disconnect();
      priceLinesRef.current = [];
      lastCandleTimeRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [meta.decimals, scheduleSyncLabels]);

  // スマホの通常表示 / ミニ表示切替時はインスタンスを再生成せず設定のみ更新する
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isMini = mobileMode === 'mini';
    chart.applyOptions({
      timeScale: {
        visible: !isMini,
        rightOffsetPixels: isMini ? 24 : 56,
      },
      rightPriceScale: {
        scaleMargins: isMini
          ? { top: 0.08, bottom: 0.08 }
          : { top: 0.14, bottom: 0.14 },
      },
    });
    scheduleSyncLabels(true);
  }, [mobileMode, scheduleSyncLabels]);

  // 初期ローソク足データの反映（モード切替・再接続時）
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    if (initialCandles.length === 0) {
      series.setData([]);
      lastCandleTimeRef.current = null;
      setLineLabels([]);
      return;
    }

    const mapped = initialCandles.map(toChartCandle);
    series.setData(mapped);
    lastCandleTimeRef.current = initialCandles[initialCandles.length - 1].time;
    chart.timeScale().fitContent();
    scheduleSyncLabels(true);
  }, [initialCandles, candlesRevision, scheduleSyncLabels]);

  // リアルタイムローソク足の更新
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !latestCandle) return;

    // 過去時刻の update() で例外が出るのを防ぐため単調増加を保証
    if (
      lastCandleTimeRef.current !== null &&
      latestCandle.time < lastCandleTimeRef.current
    ) {
      return;
    }

    series.update(toChartCandle(latestCandle));
    lastCandleTimeRef.current = latestCandle.time;
    if (positionRef.current) {
      scheduleSyncLabels(false);
    }
  }, [latestCandle, scheduleSyncLabels]);

  // ポジションに応じた3本の PriceLine（ENTRY / TP / SL）を表示・更新
  // 右側価格軸や最新価格を隠さないよう、チャート内の文字と軸ラベルはOFFにし左端へオーバーレイ表示する
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = [];

    if (!position) {
      chart.priceScale('right').applyOptions({ autoScale: true });
      setLineLabels([]);
      return;
    }

    const entryLine = series.createPriceLine({
      price: position.entryPrice,
      color: '#ffffff',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    });

    const tpLine = series.createPriceLine({
      price: position.tpPrice,
      color: '#22c55e',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: false,
      title: '',
    });

    const slLine = series.createPriceLine({
      price: position.slPrice,
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: false,
      title: '',
    });

    priceLinesRef.current = [entryLine, tpLine, slLine];
    chart.priceScale('right').applyOptions({ autoScale: true });
    scheduleSyncLabels(true);
  }, [
    position?.id,
    position?.entryPrice,
    position?.tpPrice,
    position?.slPrice,
    position?.side,
    scheduleSyncLabels,
  ]);

  const priceDirection =
    currentPrice !== null && prevPrice !== null
      ? currentPrice > prevPrice
        ? 'up'
        : currentPrice < prevPrice
          ? 'down'
          : 'flat'
      : 'flat';

  const isMobile = mobileMode !== undefined;
  const isMini = mobileMode === 'mini';
  const formattedCurrentPrice =
    currentPrice !== null
      ? currentPrice.toLocaleString('en-US', {
          minimumFractionDigits: meta.decimals,
          maximumFractionDigits: meta.decimals,
        })
      : '---.--';

  return (
    <section
      aria-label="リアルタイム相場チャート"
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#070b14]"
    >
      {/* チャート上部オーバーレイヘッダー（PC版のみ表示） */}
      {!isMobile && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0b101d]/90 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="rounded border border-cyan-500/30 bg-cyan-950/50 px-2 py-0.5 text-[11px] font-bold tracking-wider text-cyan-300">
              {meta.candleIntervalSec}s FOOT
            </span>
            <span className="text-xs font-bold tracking-wide text-slate-300">
              {meta.symbol}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                data-testid="current-price"
                className={`font-mono text-xl font-black tracking-tight transition-colors sm:text-2xl ${
                  priceDirection === 'up'
                    ? 'text-emerald-400'
                    : priceDirection === 'down'
                      ? 'text-rose-400'
                      : 'text-white'
                }`}
              >
                {formattedCurrentPrice}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {meta.unit}
              </span>
            </div>
          </div>

          {/* 水平線凡例 */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-white" />
              エントリー
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-solid border-emerald-500" />
              TP（利確）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-solid border-rose-500" />
              SL（損切）
            </span>
          </div>
        </div>
      )}

      {/* lightweight-charts マウント領域 */}
      <div
        className={`relative w-full flex-1 ${
          isMobile ? 'min-h-0' : 'min-h-[180px]'
        }`}
      >
        <div ref={containerRef} className="h-full w-full" />

        {/* 左端ラインラベルオーバーレイ（現在値や最新ローソク足に被らない配置） */}
        {position && lineLabels.length > 0 && (
          <div
            data-testid="chart-line-labels"
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 z-10 ${
              isMini ? 'left-1.5' : 'left-2'
            }`}
          >
            {lineLabels.map((item) => (
              <div
                key={item.key}
                style={{ top: `${item.y}px`, transform: 'translateY(-50%)' }}
                className={`absolute left-0 flex items-center gap-1.5 whitespace-nowrap rounded border backdrop-blur-[2px] ${
                  isMini
                    ? 'px-1 py-0 text-[9px] font-black leading-tight'
                    : 'px-1.5 py-0.5 text-[10px] font-bold'
                } ${item.className}`}
              >
                <span>{item.tag}</span>
                {item.priceText && (
                  <span className="font-mono">{item.priceText}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* スマホ版 先バレ告知ピル */}
        {isMobile && showSakibareBadge && (
          <div className="pointer-events-none absolute top-1.5 left-12 z-20 rounded border border-rose-400/75 bg-rose-600/35 px-1.5 py-0.5 text-[10px] font-black text-rose-200 backdrop-blur-sm">
            ⚡ 先バレ
          </div>
        )}

        {/* スマホ版 左下オーバーレイ（足種・現在値ピル） */}
        {isMobile && (
          <div
            className={`pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/85 backdrop-blur-sm ${
              isMini
                ? 'bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px]'
                : 'bottom-2 left-2 px-2 py-1 text-[11px]'
            }`}
          >
            <span className="font-bold text-cyan-300">
              {formatIntervalLabel(meta.candleIntervalSec)}
            </span>
            <span className="text-slate-600">|</span>
            <span
              data-testid="current-price"
              className={`font-mono font-black ${
                priceDirection === 'up'
                  ? 'text-emerald-400'
                  : priceDirection === 'down'
                    ? 'text-rose-400'
                    : 'text-white'
              }`}
            >
              {formattedCurrentPrice}
            </span>
          </div>
        )}

        {/* スマホ版 右上アクションスロット（チャート拡大 / リール重視切替ピル） */}
        {isMobile && topRightSlot && (
          <div className="absolute top-1.5 right-2 z-20">{topRightSlot}</div>
        )}

        {initialCandles.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#070b14]/70 text-sm font-semibold text-cyan-300">
            チャートデータ読込中...
          </div>
        )}
      </div>
    </section>
  );
}
