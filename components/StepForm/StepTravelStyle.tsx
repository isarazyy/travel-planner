'use client';

import {
  TRANSPORT_OPTIONS,
  COMPANION_OPTIONS,
  CHILD_AGE_OPTIONS,
  PACE_OPTIONS,
} from '@/lib/types';

export default function StepTravelStyle({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const prefs = data.preferences ?? {};
  const transportSelected = prefs.transportModes ?? [];
  const isMotorcycle = transportSelected.includes('motorcycle');

  function patch(updates: Record<string, unknown>) {
    onChange({ ...data, preferences: { ...prefs, ...updates } });
  }

  function toggleTransport(value: string) {
    const isOn = transportSelected.includes(value);
    if (isOn && transportSelected.length <= 1) return;
    const next = isOn
      ? transportSelected.filter((v: string) => v !== value)
      : [...transportSelected, value];
    patch({ transportModes: next });
  }

  function setCompanion(value: string) {
    const updates: Record<string, unknown> = { companion: value };
    if (value !== 'family') updates.childAge = undefined;
    const autoCounts: Record<string, number> = { solo: 1, couple: 2 };
    const autoCount = autoCounts[value];
    if (autoCount) {
      onChange({ ...data, peopleCount: autoCount, preferences: { ...prefs, ...updates } });
      return;
    }
    if (value === 'family' && data.peopleCount < 2) {
      onChange({ ...data, peopleCount: 3, preferences: { ...prefs, ...updates } });
      return;
    }
    if (value === 'elderly' && data.peopleCount < 2) {
      onChange({ ...data, peopleCount: 2, preferences: { ...prefs, ...updates } });
      return;
    }
    patch(updates);
  }

  const cardSel = 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20';
  const cardUn = 'border-gray-200';

  return (
    <div className="space-y-8">
      {/* Transport */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">出行方式</h2>
        <p className="mt-1 text-sm text-gray-600">可多选，至少保留一种</p>
        <div className="grid grid-cols-2 gap-3 mt-3 sm:grid-cols-3">
          {TRANSPORT_OPTIONS.map((opt) => {
            const isOn = transportSelected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleTransport(opt.value)}
                className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-left transition sm:p-4 ${
                  isOn ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="text-xl shrink-0">{opt.icon}</span>
                <span className="font-medium text-gray-900 text-sm">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {isMotorcycle && (
          <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
            <h3 className="text-xs font-semibold text-orange-800 mb-3">🏍️ 摩旅设置</h3>
            <p className="text-[11px] text-gray-500 -mt-2 mb-3">想跑山？切换到顶部「跑山路线」标签</p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">车型/排量</span>
                <input
                  type="text"
                  value={prefs.motoBikeType ?? ''}
                  onChange={(e) => patch({ motoBikeType: e.target.value })}
                  placeholder="如：250 ADV、500拉力"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-orange-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-600">每日里程：{prefs.motoDailyKm ?? 220} km</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">80</span>
                  <input
                    type="range"
                    min={80}
                    max={600}
                    step={20}
                    value={prefs.motoDailyKm ?? 220}
                    onChange={(e) => patch({ motoDailyKm: Number(e.target.value) })}
                    className="flex-1 h-1.5 accent-orange-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-400">600</span>
                </div>
              </label>
            </div>

            <div className="mt-2">
              <span className="block text-xs text-gray-600 mb-1">是否接受夜骑</span>
              <div className="flex gap-2">
                {[
                  { value: 'no', label: '不夜骑' },
                  { value: 'yes', label: '可短时夜骑' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => patch({ motoAllowNightRide: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                      (prefs.motoAllowNightRide ?? 'no') === opt.value
                        ? 'border-orange-500 bg-orange-100 text-orange-800'
                        : 'border-gray-200 bg-white text-gray-700'
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

      {/* Companion */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">同行人</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">选择本次出行的同行方式</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {COMPANION_OPTIONS.map((opt) => {
            const isSel = prefs.companion === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCompanion(opt.value)}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                  isSel ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="font-medium text-gray-900 text-sm">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {prefs.companion === 'family' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {CHILD_AGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ childAge: opt.value })}
                className={`rounded-lg border px-3 py-2 text-xs transition ${
                  prefs.childAge === opt.value ? cardSel : `${cardUn} bg-white`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        {prefs.companion && !['solo', 'couple'].includes(prefs.companion) && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-600">出行人数</span>
            <input
              type="number"
              min={2}
              max={20}
              value={data.peopleCount ?? 2}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                const clamped = Number.isNaN(raw) ? 2 : Math.max(2, Math.min(20, raw));
                onChange({ ...data, peopleCount: clamped });
              }}
              className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
            <span className="text-xs text-gray-400">人</span>
          </div>
        )}
        {prefs.companion === 'solo' && (
          <p className="mt-2 text-xs text-gray-400">已自动设为 1 人</p>
        )}
        {prefs.companion === 'couple' && (
          <p className="mt-2 text-xs text-gray-400">已自动设为 2 人</p>
        )}
      </div>

      {/* Pace */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">行程节奏</h2>
        <p className="mt-1 mb-3 text-sm text-gray-600">选择游玩强度</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PACE_OPTIONS.map((opt) => {
            const isSel = prefs.pace === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ pace: opt.value })}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                  isSel ? cardSel : `${cardUn} bg-white hover:border-gray-300`
                }`}
              >
                <span className="text-2xl shrink-0">{opt.icon}</span>
                <div>
                  <span className="font-semibold text-gray-900 text-sm">{opt.label}</span>
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
