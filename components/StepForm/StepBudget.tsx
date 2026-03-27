'use client';

import { BUDGET_LEVEL_OPTIONS } from '@/lib/types';

export default function StepBudget({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const current = data.preferences?.budgetLevel ?? '';

  function select(value: string) {
    onChange({
      ...data,
      preferences: { ...data.preferences, budgetLevel: value },
    });
  }

  function formatRange(range: [number, number], value: string) {
    if (value === 'backpacker') return `约 ¥0 – ¥${range[1]}/天`;
    if (value === 'luxury') return `约 ¥${range[0]}+/天`;
    return `约 ¥${range[0]} – ¥${range[1]}/天`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
          预算水平
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          选择大致人均每日预算，行程与推荐会据此调整
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {BUDGET_LEVEL_OPTIONS.map((opt) => {
          const isOn = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isOn}
              onClick={() => select(opt.value)}
              className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:p-5 ${
                isOn
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-gray-900">{opt.label}</div>
              <p className="mt-1 text-sm text-gray-600">{opt.desc}</p>
              <p className="mt-2 text-xs font-medium text-orange-600">
                {formatRange(opt.range, opt.value)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
