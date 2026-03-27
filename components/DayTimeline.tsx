'use client';

import { DayPlan } from '@/lib/types';
import { sanitizePlanString } from '@/lib/normalize-plan';
import type { TripWeatherPayload } from '@/lib/weather';
import { getDressAndUmbrellaAdvice } from '@/lib/weather-advice';

export default function DayTimeline({
  day,
  tripWeather,
}: {
  day: DayPlan;
  tripWeather?: TripWeatherPayload | null;
}) {
  type WeatherRow = { label: string; weather: { date: string; condition: string; tempMin: number; tempMax: number; precipProb: number } };
  const dateIso = day.dateIso;
  const dayIndex = Math.max(0, (day.day || 1) - 1);
  const weatherRows = tripWeather?.locations?.length
    ? tripWeather.locations
        .map((loc) => {
          const byIso = dateIso ? loc.days.find((d) => d.date === dateIso) : undefined;
          const byIndex = loc.days[dayIndex];
          const w = byIso || byIndex;
          if (!w) return null;
          const label = (loc.displayName || loc.query).split('·').pop()?.trim() || loc.query;
          return { label, weather: w };
        })
        .filter((x): x is WeatherRow => !!x)
    : [];
  const weatherBits = weatherRows.map(
    (r) => `${r.label} ${r.weather.condition} ${r.weather.tempMin}~${r.weather.tempMax}℃ 降水${r.weather.precipProb}%`,
  );
  const weatherDays = weatherRows.map((r) => r.weather);
  const weatherAdvice = getDressAndUmbrellaAdvice(weatherDays);

  const lastIdx = Math.max(0, day.activities.length - 1);

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-5 pt-5 pb-8 mb-4 overflow-visible">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-sm">
          D{day.day}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900">{day.theme}</h3>
          <p className="text-xs text-gray-400">{day.date}</p>
          {weatherBits.length > 0 && (
            <>
              <p className="text-xs text-sky-700 mt-1.5 leading-relaxed">
                🌤 本日天气（预报）：{weatherBits.join(' · ')}
              </p>
              {weatherAdvice ? (
                <p className="text-xs text-sky-800 mt-1 leading-relaxed">👕 出行建议：{weatherAdvice}</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="relative pl-6 border-l-2 border-orange-100 space-y-4 pb-1">
        {day.activities.map((act, i) => {
          const notesDisplay = sanitizePlanString(act.notes, '');
          const isLast = i === lastIdx;
          return (
            <div key={i} className="relative">
              <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-orange-400 border-2 border-white" />
              <div className={isLast ? 'pb-4' : 'pb-2'}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-orange-600">
                    {sanitizePlanString(act.time, '—')}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {sanitizePlanString(act.activity, '活动待补充')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 leading-[1.65]">
                  <span>📍 {sanitizePlanString(act.location, '地点待补充')}</span>
                  <span className="inline-block pb-0.5">
                    ⏱️ {sanitizePlanString(act.duration, '时长待定')}
                  </span>
                  {act.cost > 0 && <span>💰 ¥{act.cost}</span>}
                </div>
                {notesDisplay ? (
                  <p className="text-xs text-gray-400 mt-1">{notesDisplay}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
