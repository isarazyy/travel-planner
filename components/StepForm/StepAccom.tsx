'use client';

import { ACCOM_OPTIONS, type TripFormData } from '@/lib/types';

export default function StepAccom({
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

  const setAccommodation = (value: string) => {
    onChange({
      ...d,
      preferences: { ...prefs, accommodation: value },
    });
  };

  const cardBase =
    'flex w-full cursor-pointer flex-col gap-1 rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-md sm:p-5';
  const selected = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const unselected = 'border-gray-200';

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-gray-900">住宿偏好</h3>
      <p className="mb-4 text-sm text-gray-500">选择你更倾向的住宿类型</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOM_OPTIONS.map((opt) => {
          const isSel = prefs.accommodation === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAccommodation(opt.value)}
              className={`${cardBase} ${isSel ? selected : unselected}`}
            >
              <span className="font-semibold text-gray-900">{opt.label}</span>
              <span className="text-sm text-gray-600">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
