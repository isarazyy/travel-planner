'use client';

import Link from 'next/link';

export default function RegisterPrompt({
  open,
  onClose,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  if (!open) return null;

  const returnUrl = '/history';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-gray-900">{title || '注册后解锁完整功能'}</h2>
          <p className="text-sm text-gray-500 mt-2">
            {description || '注册账号后即可使用 AI 对话修改、导出方案等全部功能。'}
          </p>
        </div>

        <div className="space-y-2">
          <Link
            href={`/register?returnTo=${encodeURIComponent(returnUrl)}`}
            className="flex w-full items-center justify-center py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold transition"
          >
            免费注册
          </Link>
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnUrl)}`}
            className="flex w-full items-center justify-center py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium transition"
          >
            已有账号，去登录
          </Link>
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  );
}
