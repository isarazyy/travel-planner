'use client';

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
  function patch(updates: Record<string, unknown>) {
    onChange({ ...data, preferences: { ...prefs, ...updates } });
  }

  function selectBudget(value: string) {
    const updates: Record<string, unknown> = { budgetLevel: value };
    if (BUDGET_ACCOM_MAP[value]) {
      updates.accommodation = BUDGET_ACCOM_MAP[value];
    }
    patch(updates);
  }

  function selectAccom(value: string) {
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

      {/* Accommodation */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">住宿偏好</h2>
        </div>
        <p className="mb-3 text-sm text-gray-600">已根据预算自动推荐，也可手动调整</p>

        <p className="text-xs font-medium text-gray-500 mb-2">住什么类型</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 mb-5">
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

        <p className="text-xs font-medium text-gray-500 mb-2">额外要求（选填，可多选）</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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

      {/* Extra info */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">补充信息</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">选填，越具体 AI 越懂你；没有可以直接生成</p>
        <div className="space-y-3">
          <input
            type="text"
            value={prefs.mustVisit ?? ''}
            onChange={(e) => patch({ mustVisit: e.target.value })}
            maxLength={200}
            placeholder="必去地点，如：武侯祠、宽窄巷子"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <input
            type="text"
            value={prefs.mustAvoid ?? ''}
            onChange={(e) => patch({ mustAvoid: e.target.value })}
            maxLength={200}
            placeholder="希望避开，如：不想去太商业化的地方"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <textarea
            rows={3}
            value={prefs.specialNeeds ?? ''}
            onChange={(e) => patch({ specialNeeds: e.target.value })}
            maxLength={500}
            placeholder="特殊需求，如：素食、清真、海鲜过敏、轮椅无障碍、带宠物等"
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>
    </div>
  );
}
