'use client';

import {
  INTEREST_OPTIONS,
  FOOD_PREF_OPTIONS,
  WAKE_OPTIONS,
} from '@/lib/types';

export default function StepPreferences({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const prefs = data.preferences ?? {};
  const interests: string[] = Array.isArray(prefs.interests) ? prefs.interests : [];
  const foodPrefs: string[] = Array.isArray(prefs.foodPrefs) ? prefs.foodPrefs : [];

  function patch(updates: Record<string, unknown>) {
    onChange({ ...data, preferences: { ...prefs, ...updates } });
  }

  function toggleInterest(value: string) {
    const next = interests.includes(value)
      ? interests.filter((v) => v !== value)
      : [...interests, value];
    patch({ interests: next });
  }

  function toggleFood(value: string) {
    const next = foodPrefs.includes(value)
      ? foodPrefs.filter((v) => v !== value)
      : [...foodPrefs, value];
    patch({ foodPrefs: next });
  }

  const cardSel = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const cardUn = 'border-gray-200';

  return (
    <div className="space-y-8">
      {/* Interests */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">兴趣偏好</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">可多选，也可跳过让 AI 综合推荐</p>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {INTEREST_OPTIONS.map((opt) => {
            const isSel = interests.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleInterest(opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${
                  isSel ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="text-xs font-medium text-gray-900">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Food */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">餐饮偏好</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">可多选</p>
        <div className="grid grid-cols-2 gap-2.5">
          {FOOD_PREF_OPTIONS.map((opt) => {
            const isOn = foodPrefs.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleFood(opt.value)}
                className={`rounded-xl border p-3.5 text-left text-sm font-medium transition ${
                  isOn ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={prefs.dietaryNotes ?? ''}
          onChange={(e) => patch({ dietaryNotes: e.target.value })}
          maxLength={200}
          rows={2}
          placeholder="饮食备注（选填）：如素食、清真、海鲜过敏等"
          className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Wake up */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">起床与出发</h2>
        <div className="grid grid-cols-3 gap-2.5 mt-3">
          {WAKE_OPTIONS.map((opt) => {
            const isOn = prefs.wakeUpTime === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ wakeUpTime: opt.value })}
                className={`rounded-xl border p-3 text-center transition ${
                  isOn ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="mr-1">{opt.icon}</span>
                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
