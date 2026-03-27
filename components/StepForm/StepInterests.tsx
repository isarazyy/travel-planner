'use client';

import { INTEREST_OPTIONS, type TripFormData } from '@/lib/types';

export default function StepInterests({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const d = data as TripFormData;
  const defaultPrefs = {
    companion: '',
    pace: '',
    interests: [] as string[],
    accommodation: '',
    foodPrefs: [] as string[],
    budgetLevel: '',
    transportModes: [] as string[],
    wakeUpTime: '',
  };
  const prefs = { ...defaultPrefs, ...(d.preferences ?? {}) };

  const interests = Array.isArray(prefs.interests) ? prefs.interests : [];

  const toggle = (value: string) => {
    const next = interests.includes(value)
      ? interests.filter((v) => v !== value)
      : [...interests, value];
    onChange({
      ...d,
      preferences: { ...prefs, interests: next },
    });
  };

  const cardBase =
    'flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-white p-4 text-center shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-md';
  const selected = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const unselected = 'border-gray-200';

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-gray-900">兴趣偏好</h3>
      <p className="mb-4 text-sm text-gray-500">可多选，也可以跳过让 AI 综合推荐</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {INTEREST_OPTIONS.map((opt) => {
          const isSel = interests.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`${cardBase} ${isSel ? selected : unselected}`}
            >
              <span className="text-2xl" aria-hidden>
                {opt.icon}
              </span>
              <span className="text-sm font-medium text-gray-900">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
