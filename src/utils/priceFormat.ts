/** 2WAYボタン等で整数下2桁を強調表示するための分割価格 */
export interface HighlightPriceParts {
  head: string;
  big: string;
  tail: string;
}

/**
 * 数値をカンマ区切り・指定小数桁に整形し、整数部の下2桁を強調用（big）へ分離する
 */
export function splitHighlightPrice(
  price: number | null,
  decimals: number,
): HighlightPriceParts {
  if (price === null || !Number.isFinite(price)) {
    return { head: '---', big: '--', tail: '' };
  }

  const formatted = price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const dotIdx = formatted.indexOf('.');
  const intPart = dotIdx >= 0 ? formatted.slice(0, dotIdx) : formatted;
  const tail = dotIdx >= 0 ? formatted.slice(dotIdx) : '';

  if (intPart.length <= 2) {
    return { head: '', big: intPart, tail };
  }

  return {
    head: intPart.slice(0, -2),
    big: intPart.slice(-2),
    tail,
  };
}

/**
 * ローソク足間隔（秒）を日本語の足種ラベルへ変換する
 */
export function formatIntervalLabel(intervalSec: number): string {
  if (intervalSec >= 60 && intervalSec % 60 === 0) {
    return `${intervalSec / 60}分足`;
  }
  return `${intervalSec}秒足`;
}
