'use client';

import {
  COMPANION_OPTIONS,
  CHILD_AGE_OPTIONS,
  type TripFormData,
} from '@/lib/types';

export default function StepCompanion({
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

  const setCompanion = (value: string) => {
    onChange({
      ...d,
      preferences: {
        ...prefs,
        companion: value,
        ...(value !== 'family' ? { childAge: undefined } : {}),
      },
    });
  };

  const setChildAge = (value: string) => {
    onChange({
      ...d,
      preferences: { ...prefs, childAge: value },
    });
  };

  const cardBase =
    'flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-md';
  const selected = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const unselected = 'border-gray-200';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-lg font-semibold text-gray-900">同行类型</h3>
        <p className="mb-4 text-sm text-gray-500">选择本次出行的主要同行方式</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANION_OPTIONS.map((opt) => {
            const isSel = prefs.companion === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCompanion(opt.value)}
                className={`${cardBase} text-left ${isSel ? selected : unselected}`}
              >
                <span className="text-2xl" aria-hidden>
                  {opt.icon}
                </span>
                <span className="font-medium text-gray-900">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {prefs.companion === 'family' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-300 sm:p-6">
          <h4 className="mb-3 text-sm font-semibold text-gray-900">孩子年龄段</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CHILD_AGE_OPTIONS.map((opt) => {
              const isSel = prefs.childAge === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChildAge(opt.value)}
                  className={`${cardBase} justify-between ${isSel ? selected : unselected}`}
                >
                  <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
