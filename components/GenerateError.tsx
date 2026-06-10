'use client';

/**
 * 生成失败时的友好提示卡片，带一键重试动作。
 * 区分普通校验提示（canRetry=false，只显示文字）与生成失败（提供重试按钮）。
 */
export default function GenerateError({
  message,
  canRetry,
  isFast,
  onRetry,
  onRetryFast,
}: {
  message: string;
  canRetry: boolean;
  isFast: boolean;
  onRetry: () => void;
  onRetryFast: () => void;
}) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm text-red-700 leading-relaxed">{message}</p>
      {canRetry ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition"
          >
            重新生成
          </button>
          {!isFast ? (
            <button
              type="button"
              onClick={onRetryFast}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition"
            >
              改用极速模式重试（更快更稳）
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
