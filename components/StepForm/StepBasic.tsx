'use client';

import { useState } from 'react';
import CityPicker from '@/components/CityPicker';
import {
  DATE_MODE_OPTIONS,
  DESTINATION_MODE_OPTIONS,
  DESTINATION_THEME_OPTIONS,
  type TripFormData,
  type DateMode,
} from '@/lib/types';
import { compareIso } from '@/lib/date-utils';

type UIDestMode = 'specific' | 'recommend';


export default function StepBasic({
  data,
  onChange,
}: {
  data: any;
  onChange: (d: any) => void;
}) {
  const d = data as TripFormData;
  const [destInput, setDestInput] = useState('');

  const destinations = Array.isArray(d.destinations) ? d.destinations : [];
  const destinationThemes = Array.isArray(d.destinationThemes) ? d.destinationThemes : [];
  const dateMode: DateMode = d.dateMode || 'fixed';

  const uiMode: UIDestMode = d.destinationMode === 'specific' ? 'specific' : 'recommend';

  const update = (partial: Partial<TripFormData>) => onChange({ ...d, ...partial });

  function setUIMode(mode: UIDestMode) {
    if (mode === 'specific') {
      update({
        destinationMode: 'specific',
        destinations: [],
        destinationThemes: [],
        openModeDetails: [],
        destinationHint: '',
      });
    } else {
      update({
        destinationMode: 'open',
        destinations: [],
        destinationThemes: [],
        openModeDetails: [],
        destinationHint: '',
      });
    }
  }

  function toggleTheme(value: string) {
    const next = destinationThemes.includes(value)
      ? destinationThemes.filter((v) => v !== value)
      : [...destinationThemes, value];
    const mode = next.length > 0 ? 'theme' : 'open';
    update({ destinationThemes: next, destinationMode: mode } as any);
  }

  function addDestination(city?: string) {
    const newDests = [...destinations];

    if (city) {
      const inputText = destInput.trim();
      if (inputText) {
        const tokens = inputText.split(/[\s,，、]+/).filter(Boolean);
        for (const c of tokens.slice(0, -1)) {
          if (!newDests.includes(c)) newDests.push(c);
        }
      }
      if (!newDests.includes(city.trim())) newDests.push(city.trim());
    } else {
      const inputText = destInput.trim();
      if (!inputText) return;
      const tokens = inputText.split(/[\s,，、]+/).filter(Boolean);
      for (const c of tokens) {
        if (!newDests.includes(c)) newDests.push(c);
      }
    }

    if (newDests.length > destinations.length) {
      update({ destinations: newDests });
    }
    setDestInput('');
  }

  function removeDestination(idx: number) {
    update({ destinations: destinations.filter((_, i) => i !== idx) });
  }

  function handleDestKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addDestination(); }
  }

  const inputClass =
    'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20';

  return (
    <div className="space-y-6">
      {/* Departure */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">出发地</h3>
        <CityPicker
          inline
          value={d.departure ?? ''}
          onChange={(val) => update({ departure: val })}
          onSelect={(city) => update({ departure: city })}
          placeholder="输入或选择出发城市"
        />
      </div>

      {/* Destination */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">目的地</h3>

        <div className="flex gap-2 mb-4">
          {DESTINATION_MODE_OPTIONS.map((opt) => {
            const active = (opt.value === 'specific' && uiMode === 'specific') ||
                           (opt.value !== 'specific' && uiMode === 'recommend');
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setUIMode(opt.value === 'specific' ? 'specific' : 'recommend')}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  active
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="text-base">{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* specific: city input + tags */}
        {uiMode === 'specific' && (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              列出想去的城市即可，<strong className="text-gray-700">不用管顺序</strong>，AI 自动规划最优路线
            </p>

            {destinations.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {destinations.map((dest, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium"
                  >
                    {dest}
                    <button
                      type="button"
                      onClick={() => removeDestination(i)}
                      className="text-orange-400 hover:text-orange-600 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <CityPicker
              inline
              value={destInput}
              onChange={setDestInput}
              onKeyDown={handleDestKeyDown}
              onConfirm={() => addDestination()}
              selected={destinations}
              onSelect={(city) => addDestination(city)}
              placeholder="输入城市名回车添加，或点击下拉选择"
            />
          </div>
        )}

        {/* recommend: merged theme + scope */}
        {uiMode === 'recommend' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">都是选填，选得越多 AI 推荐越精准；啥都不选也行</p>

            {/* Theme tags */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">想玩什么类型？</p>
              <div className="flex flex-wrap gap-2">
                {DESTINATION_THEME_OPTIONS.map((opt) => {
                  const on = destinationThemes.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleTheme(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition ${
                        on ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Free text hint */}
            <input
              type="text"
              value={d.destinationHint ?? ''}
              onChange={(e) => update({ destinationHint: e.target.value })}
              placeholder="其他想法，如：想轻松一点、预算别太高、周末出发"
              maxLength={200}
              className={`${inputClass} w-full`}
            />
          </div>
        )}
      </div>

      {/* Date mode */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">出行日期</h3>

        <div className="flex flex-wrap gap-2 mb-4">
          {DATE_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ dateMode: opt.value, startDate: '', endDate: '' })}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                dateMode === opt.value
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="text-base">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>

        {dateMode === 'fixed' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">出发日期</span>
              <input
                type="date"
                value={d.startDate ?? ''}
                max={d.endDate || undefined}
                onChange={(e) => {
                  const next = e.target.value;
                  let end = d.endDate ?? '';
                  if (next && end && compareIso(end, next) < 0) {
                    end = next;
                  }
                  update({ startDate: next, endDate: end });
                }}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">返程日期</span>
              <input
                type="date"
                value={d.endDate ?? ''}
                min={d.startDate || undefined}
                onChange={(e) => {
                  let next = e.target.value;
                  const start = d.startDate ?? '';
                  if (start && next && compareIso(next, start) < 0) {
                    next = start;
                  }
                  update({ endDate: next });
                }}
                className={inputClass}
              />
            </label>
          </div>
        )}

        {dateMode === 'flexible_end' && (
          <label className="flex flex-col gap-1.5 max-w-xs">
            <span className="text-sm font-medium text-gray-700">出发日期</span>
            <input
              type="date"
              value={d.startDate ?? ''}
              onChange={(e) => update({ startDate: e.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-gray-400">返回日期由 AI 根据行程推荐</span>
          </label>
        )}

        {dateMode === 'flexible_all' && (
          <div>
            <p className="text-sm text-gray-500 mb-2">有什么时间偏好？没有可以留空</p>
            <input
              type="text"
              placeholder="例如：想夏天去、避开国庆、周末出发…"
              maxLength={200}
              value={d.dateHint ?? ''}
              onChange={(e) => update({ dateHint: e.target.value })}
              className={`${inputClass} w-full`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
