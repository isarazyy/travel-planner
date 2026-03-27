'use client';

import { WAKE_OPTIONS } from '@/lib/types';

export default function StepExtra({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const wake = data.preferences?.wakeUpTime ?? '';

  function patchPreferences(updates: Record<string, string | undefined>) {
    onChange({
      ...data,
      preferences: { ...data.preferences, ...updates },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
          其他偏好
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          出发节奏、必去/避雷与特殊需求，越具体越好
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-800">起床与出发</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {WAKE_OPTIONS.map((opt) => {
            const isOn = wake === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isOn}
                onClick={() => patchPreferences({ wakeUpTime: opt.value })}
                className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                  isOn
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className="mr-2" aria-hidden>
                  {opt.icon}
                </span>
                <span className="font-medium text-gray-900">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <label
            htmlFor="must-visit"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            必去地点（选填）
          </label>
          <input
            id="must-visit"
            type="text"
            value={data.preferences?.mustVisit ?? ''}
            onChange={(e) => patchPreferences({ mustVisit: e.target.value })}
            placeholder="如：武侯祠、宽窄巷子"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <label
            htmlFor="must-avoid"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            希望避开（选填）
          </label>
          <input
            id="must-avoid"
            type="text"
            value={data.preferences?.mustAvoid ?? ''}
            onChange={(e) => patchPreferences({ mustAvoid: e.target.value })}
            placeholder="如：不想去太商业化的地方"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <label
            htmlFor="special-needs"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            特殊需求（选填）
          </label>
          <textarea
            id="special-needs"
            rows={4}
            value={data.preferences?.specialNeeds ?? ''}
            onChange={(e) =>
              patchPreferences({ specialNeeds: e.target.value })
            }
            placeholder="如：轮椅无障碍、带宠物、需要婴儿设施等"
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>
    </div>
  );
}
