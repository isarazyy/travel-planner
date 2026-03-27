'use client';

import { PACE_OPTIONS, type TripFormData } from '@/lib/types';

export default function StepPace({
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

  const setPace = (value: string) => {
    onChange({
      ...d,
      preferences: { ...prefs, pace: value },
    });
  };

  const cardBase =
    'flex w-full cursor-pointer flex-col gap-2 rounded-xl border bg-white p-5 text-left shadow-sm transition-all duration-200 hover:border-orange-200 hover:shadow-md sm:p-6';
  const selected = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const unselected = 'border-gray-200';

  return (
    <div>
      <h3 className="mb-1 text-lg font-semibold text-gray-900">行程节奏</h3>
      <p className="mb-4 text-sm text-gray-500">选择更符合你体力和喜好的游玩强度</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PACE_OPTIONS.map((opt) => {
          const isSel = prefs.pace === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPace(opt.value)}
              className={`${cardBase} ${isSel ? selected : unselected}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {opt.icon}
                </span>
                <span className="text-lg font-semibold text-gray-900">{opt.label}</span>
              </div>
              <p className="pl-[3.25rem] text-sm leading-relaxed text-gray-600">{opt.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
