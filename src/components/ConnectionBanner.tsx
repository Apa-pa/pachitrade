import type { FeedMode, FeedStatus } from '../feeds/index.ts';
import { AlertTriangleIcon, RefreshIcon } from './Icons.tsx';

interface ConnectionBannerProps {
  mode: FeedMode;
  status: FeedStatus;
  message: string;
  onSwitchToDemo: () => void;
  onRetry: () => void;
}

/**
 * REALTIMEモードの接続エラーや再接続中に表示する案内バナー
 */
export function ConnectionBanner({
  mode,
  status,
  message,
  onSwitchToDemo,
  onRetry,
}: ConnectionBannerProps) {
  if (mode !== 'realtime') return null;
  if (status !== 'error' && status !== 'reconnecting') return null;

  const isError = status === 'error';

  return (
    <div
      role="alert"
      className={`relative z-20 border-b px-4 py-2 text-xs sm:text-sm ${
        isError
          ? 'border-rose-500/50 bg-rose-950/75 text-rose-100'
          : 'border-amber-500/40 bg-amber-950/60 text-amber-100'
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon
            className={`h-4 w-4 shrink-0 ${
              isError ? 'text-rose-400' : 'text-amber-400'
            }`}
          />
          <span>{message}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/20"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            再接続
          </button>
          <button
            type="button"
            onClick={onSwitchToDemo}
            className="cursor-pointer rounded-md bg-fuchsia-600 px-3 py-1 text-xs font-bold text-white shadow-[0_0_12px_rgba(217,70,239,0.5)] transition hover:bg-fuchsia-500"
          >
            DEMOモードへ切替
          </button>
        </div>
      </div>
    </div>
  );
}
