'use client';

import { FOOD_PREF_OPTIONS } from '@/lib/types';

export default function StepFood({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const selected = data.preferences?.foodPrefs ?? [];

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v: string) => v !== value)
      : [...selected, value];
    onChange({
      ...data,
      preferences: { ...data.preferences, foodPrefs: next },
    });
  }

  function setDietaryNotes(notes: string) {
    onChange({
      ...data,
      preferences: { ...data.preferences, dietaryNotes: notes },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
          饮食偏好
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          可多选，帮助我们推荐合适的用餐方式
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FOOD_PREF_OPTIONS.map((opt) => {
          const isOn = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                isOn
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="font-medium text-gray-900">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <label
          htmlFor="dietary-notes"
          className="mb-2 block text-sm font-medium text-gray-800"
        >
          饮食备注（选填）
        </label>
        <textarea
          id="dietary-notes"
          rows={4}
          value={data.preferences?.dietaryNotes ?? ''}
          onChange={(e) => setDietaryNotes(e.target.value)}
          placeholder="如：素食、清真、海鲜过敏等"
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>
    </div>
  );
}
