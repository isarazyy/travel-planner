'use client';

import { useState } from 'react';
import {
  BUDGET_LEVEL_OPTIONS,
  ACCOM_OPTIONS,
  ACCOM_STYLE_OPTIONS,
} from '@/lib/types';

const BUDGET_ACCOM_MAP: Record<string, string> = {
  backpacker: 'hostel',
  economy: 'budget_hotel',
  comfort: 'comfort_hotel',
  luxury: 'luxury',
};

export default function StepBudgetAccom({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const prefs = data.preferences ?? {};
  const styles: string[] = prefs.accommodationStyles ?? [];
  const [accomManual, setAccomManual] = useState(false);

  function patch(updates: Record<string, unknown>) {
    onChange({ ...data, preferences: { ...prefs, ...updates } });
  }

  function selectBudget(value: string) {
    const updates: Record<string, unknown> = { budgetLevel: value };
    if (!accomManual && BUDGET_ACCOM_MAP[value]) {
      updates.accommodation = BUDGET_ACCOM_MAP[value];
    }
    patch(updates);
  }

  function selectAccom(value: string) {
    setAccomManual(true);
    patch({ accommodation: value });
  }

  function toggleStyle(value: string) {
    let next: string[];
    if (value === 'no_preference') {
      next = styles.includes('no_preference') ? [] : ['no_preference'];
    } else {
      const without = styles.filter((s) => s !== 'no_preference');
      next = without.includes(value)
        ? without.filter((s) => s !== value)
        : [...without, value];
    }
    patch({ accommodationStyles: next });
  }

  function formatRange(range: [number, number], value: string) {
    if (value === 'backpacker') return `¥0–${range[1]}/天`;
    if (value === 'luxury') return `¥${range[0]}+/天`;
    return `¥${range[0]}–${range[1]}/天`;
  }

  const cardSel = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const cardUn = 'border-gray-200';

  return (
    <div className="space-y-8">
      {/* Budget */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">预算水平</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">人均每日预算，住宿会自动匹配</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {BUDGET_LEVEL_OPTIONS.map((opt) => {
            const isOn = prefs.budgetLevel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectBudget(opt.value)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  isOn ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <div className="font-semibold text-gray-900 text-sm">{opt.label}</div>
                <p className="mt-0.5 text-xs text-orange-600 font-medium">
                  {formatRange(opt.range, opt.value)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accommodation tier */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">住宿档次</h2>
            <p className="text-sm text-gray-600">已根据预算自动推荐，也可手动调整</p>
          </div>
          {accomManual && (
            <button
              type="button"
              onClick={() => {
                setAccomManual(false);
                if (BUDGET_ACCOM_MAP[prefs.budgetLevel]) {
                  patch({ accommodation: BUDGET_ACCOM_MAP[prefs.budgetLevel] });
                }
              }}
              className="text-xs text-orange-600 hover:text-orange-800"
            >
              恢复自动匹配
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {ACCOM_OPTIONS.map((opt) => {
            const isSel = prefs.accommodation === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectAccom(opt.value)}
                className={`rounded-xl border p-3 text-left transition ${
                  isSel ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="font-semibold text-gray-900 text-sm">{opt.label}</span>
                <span className="block text-xs text-gray-500">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accommodation style */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">住宿风格偏好</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">可多选（选填）</p>
        <div className="grid grid-cols-2 gap-2.5">
          {ACCOM_STYLE_OPTIONS.map((opt) => {
            const isSel = styles.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStyle(opt.value)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  isSel ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="text-xl shrink-0">{opt.icon}</span>
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 text-sm">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
