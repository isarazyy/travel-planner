'use client';

import { useState } from 'react';
import {
  DATE_MODE_OPTIONS,
  DESTINATION_MODE_OPTIONS,
  DESTINATION_THEME_OPTIONS,
  type TripFormData,
  type DateMode,
  type DestinationMode,
} from '@/lib/types';

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
  const destinationMode: DestinationMode = d.destinationMode || 'specific';
  const dateMode: DateMode = d.dateMode || 'fixed';

  const update = (partial: Partial<TripFormData>) => onChange({ ...d, ...partial });

  function addDestination() {
    const trimmed = destInput.trim();
    if (!trimmed) return;
    if (destinations.includes(trimmed)) { setDestInput(''); return; }
    update({ destinations: [...destinations, trimmed] });
    setDestInput('');
  }

  function removeDestination(idx: number) {
    update({ destinations: destinations.filter((_, i) => i !== idx) });
  }

  function handleDestKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addDestination(); }
  }

  function toggleTheme(value: string) {
    const next = destinationThemes.includes(value)
      ? destinationThemes.filter((v) => v !== value)
      : [...destinationThemes, value];
    update({ destinationThemes: next });
  }

  const clampPeople = (n: number) => Math.min(20, Math.max(1, n));

  const inputClass =
    'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20';

  return (
    <div className="space-y-6">
      {/* Departure */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">出发地</h3>
        <input
          type="text"
          value={d.departure ?? ''}
          onChange={(e) => update({ departure: e.target.value })}
          placeholder="你从哪里出发？如：北京"
          className={`${inputClass} w-full`}
        />
      </div>

      {/* Destination strategy */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">目的地</h3>
        <p className="mb-4 text-sm text-gray-500">你可以给具体地点，也可以只给出游方向，甚至完全让 AI 推荐</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {DESTINATION_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ destinationMode: opt.value, destinations: [], destinationThemes: [], destinationHint: '' })}
              className={`text-left rounded-xl border p-4 transition-all duration-200 ${
                destinationMode === opt.value
                  ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20'
                  : 'border-gray-200 hover:border-orange-200'
              }`}
            >
              <div className="text-xl mb-1">{opt.icon}</div>
              <div className="text-sm font-medium text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {destinationMode === 'specific' && (
          <div>
            <p className="text-sm text-orange-800/90 bg-orange-50/80 border border-orange-100 rounded-lg px-3 py-2 mb-3">
              把想去的城市/区域都列出来即可，<strong>不用管先后顺序</strong>。AI 会根据距离、交通方式和你的节奏，自动规划<strong>先去哪儿、后去哪儿、怎么走最顺</strong>。
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

            <div className="flex gap-2">
              <input
                type="text"
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
                onKeyDown={handleDestKeyDown}
                placeholder="输入城市或区域，回车添加（顺序随意）"
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={addDestination}
                disabled={!destInput.trim()}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                + 添加
              </button>
            </div>
          </div>
        )}

        {destinationMode === 'theme' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DESTINATION_THEME_OPTIONS.map((opt) => {
                const on = destinationThemes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleTheme(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                      on ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={d.destinationHint ?? ''}
              onChange={(e) => update({ destinationHint: e.target.value })}
              placeholder="补充你的想法，如：3天短途、不要太贵、周末出发"
              className={`${inputClass} w-full`}
            />
          </div>
        )}

        {destinationMode === 'open' && (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
            你可以什么都不填，AI 会根据出发地推荐最近热门去处并生成规划。<br />
            如果有要求可写在下面：
            <input
              type="text"
              value={d.destinationHint ?? ''}
              onChange={(e) => update({ destinationHint: e.target.value })}
              placeholder="例如：想轻松一点、预算不要太高、优先自然风景"
              className={`${inputClass} w-full mt-2`}
            />
          </div>
        )}
      </div>

      {/* Date mode */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">出行日期</h3>
        <p className="mb-4 text-sm text-gray-500">不确定也没关系，AI 会帮你推荐</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {DATE_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ dateMode: opt.value, startDate: '', endDate: '' })}
              className={`text-left rounded-xl border p-4 transition-all duration-200 ${
                dateMode === opt.value
                  ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20'
                  : 'border-gray-200 hover:border-orange-200'
              }`}
            >
              <div className="text-xl mb-1">{opt.icon}</div>
              <div className="text-sm font-medium text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
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
                onChange={(e) => update({ startDate: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">返程日期</span>
              <input
                type="date"
                value={d.endDate ?? ''}
                onChange={(e) => update({ endDate: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        )}
        {dateMode === 'fixed' && (
          <p className="text-xs text-gray-500 mt-3">
            AI 按你选的出发、返程日安排全程，不会建议改到别的月份；并会在方案里补充<strong className="text-gray-700">顺路/半日周边</strong>可玩点。
          </p>
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
          <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-4">
            AI 将根据你的目的地和偏好，推荐最佳出行季节和天数
          </div>
        )}
      </div>

      {/* People count */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">出行人数</h3>
        <input
          type="number"
          min={1}
          max={20}
          value={d.peopleCount ?? 1}
          onChange={(e) => {
            const raw = parseInt(e.target.value, 10);
            update({ peopleCount: Number.isNaN(raw) ? 1 : clampPeople(raw) });
          }}
          className={`${inputClass} max-w-[12rem]`}
        />
        <span className="text-xs text-gray-500 ml-2">1-20 人</span>
      </div>
    </div>
  );
}
