'use client';

import { TRANSPORT_OPTIONS } from '@/lib/types';

export default function StepTransport({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const selected = data.preferences?.transportModes ?? [];
  const isMotorcycle = selected.includes('motorcycle');

  function toggle(value: string) {
    const isOn = selected.includes(value);
    if (isOn && selected.length <= 1) {
      return;
    }
    const next = isOn
      ? selected.filter((v: string) => v !== value)
      : [...selected, value];
    onChange({
      ...data,
      preferences: { ...data.preferences, transportModes: next },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">
          出行方式
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          可多选；至少保留一种，以便生成对应方案
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TRANSPORT_OPTIONS.map((opt) => {
          const isOn = selected.includes(opt.value);
          const isOnly = isOn && selected.length === 1;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              title={isOnly ? '至少选择一种出行方式' : undefined}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:p-5 ${
                isOn
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-2xl"
                aria-hidden
              >
                {opt.icon}
              </span>
              <span className="font-medium text-gray-900">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {isMotorcycle && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-orange-800 mb-3">摩旅专用设置</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">车型/排量</span>
              <input
                type="text"
                value={data.preferences?.motoBikeType ?? ''}
                onChange={(e) =>
                  onChange({
                    ...data,
                    preferences: { ...data.preferences, motoBikeType: e.target.value },
                  })
                }
                placeholder="如：250 ADV、500拉力、踏板150"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">每日可接受里程（km）</span>
              <input
                type="number"
                min={80}
                max={600}
                value={data.preferences?.motoDailyKm ?? 220}
                onChange={(e) =>
                  onChange({
                    ...data,
                    preferences: {
                      ...data.preferences,
                      motoDailyKm: Math.max(80, Math.min(600, Number(e.target.value) || 220)),
                    },
                  })
                }
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </label>
          </div>

          <div className="mt-3">
            <span className="block text-xs text-gray-600 mb-1.5">是否接受夜骑</span>
            <div className="flex gap-2">
              {[
                { value: 'no', label: '不接受夜骑（更安全）' },
                { value: 'yes', label: '可接受短时夜骑' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...data,
                      preferences: { ...data.preferences, motoAllowNightRide: opt.value },
                    })
                  }
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    (data.preferences?.motoAllowNightRide ?? 'no') === opt.value
                      ? 'border-orange-500 bg-orange-100 text-orange-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
