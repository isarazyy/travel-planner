'use client';

import { DayPlan } from '@/lib/types';
import { sanitizePlanString } from '@/lib/normalize-plan';
import type { TripWeatherPayload } from '@/lib/weather';
import { getDressAndUmbrellaAdvice } from '@/lib/weather-advice';
import { buildAmapNavUrl } from '@/lib/amap-uri';

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

  const activities = Array.isArray(day.activities) ? day.activities : [];
  const lastIdx = Math.max(0, activities.length - 1);

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

      {activities.length === 0 ? (
        <p className="text-sm text-gray-400 pl-6 py-4">本日暂无详细安排</p>
      ) : (
      <div className="relative pl-6 border-l-2 border-orange-100 space-y-4 pb-1">
        {activities.map((act, i) => {
          const notesDisplay = sanitizePlanString(act.notes, '');
          const transportBits = [
            act.transportInfo?.fromStation && act.transportInfo?.toStation
              ? `${act.transportInfo.fromStation} → ${act.transportInfo.toStation}`
              : undefined,
            act.transportInfo?.trainNo ? `车次 ${act.transportInfo.trainNo}` : undefined,
            act.transportInfo?.departTime && act.transportInfo?.arriveTime
              ? `${act.transportInfo.departTime} - ${act.transportInfo.arriveTime}`
              : undefined,
            act.transportInfo?.duration,
            act.transportInfo?.priceNote,
          ].filter(Boolean) as string[];
          const hasTransportInfo = transportBits.length > 0;
          const actText = `${act.activity || ''} ${act.notes || ''} ${act.location || ''}`;
          const isFlight = /飞机|航班|飞往|机场|航空|飞行/.test(actText);
          const hasStayInfo = !!(act.stayInfo?.hotelName || (act.stayInfo?.pricePerNight || 0) > 0);
          const hasFoodInfo = !!(
            act.foodRecommendation?.shopName ||
            act.foodRecommendation?.specialty ||
            act.foodRecommendation?.reason ||
            act.foodRecommendation?.rating
          );
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 leading-[1.65]">
                  <span>📍 {sanitizePlanString(act.location, '地点待补充')}</span>
                  {act.location && act.location !== '地点待补充' && (
                    <a
                      href={buildAmapNavUrl(act.location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition whitespace-nowrap"
                    >
                      导航
                    </a>
                  )}
                  <span className="inline-block pb-0.5">
                    ⏱️ {sanitizePlanString(act.duration, '时长待定')}
                  </span>
                  {act.cost > 0 && <span>💰 ¥{act.cost}</span>}
                </div>
                {notesDisplay ? (
                  <p className="text-xs text-gray-400 mt-1">{notesDisplay}</p>
                ) : null}
                {hasTransportInfo ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-blue-800 leading-relaxed">
                      {isFlight ? '✈️' : '🚄'} 交通信息：{transportBits.join(' · ')}
                    </p>
                    {isFlight ? (
                      <a
                        href="https://flights.ctrip.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition whitespace-nowrap"
                      >
                        🔍 查航班比价
                      </a>
                    ) : (
                      <a
                        href="https://www.12306.cn/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition whitespace-nowrap"
                      >
                        🔍 去12306查车次
                      </a>
                    )}
                  </div>
                ) : null}
                {hasStayInfo ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <p className="text-xs text-indigo-700 leading-relaxed">
                      🏨 住宿：{act.stayInfo?.hotelName || '酒店待补充'}
                      {(act.stayInfo?.pricePerNight || 0) > 0 ? ` · 约¥${act.stayInfo?.pricePerNight}/晚` : ''}
                    </p>
                    {act.stayInfo?.hotelName && (
                      <a
                        href={buildAmapNavUrl(act.stayInfo.hotelName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition whitespace-nowrap shrink-0"
                      >
                        导航
                      </a>
                    )}
                  </div>
                ) : null}
                {hasFoodInfo ? (
                  <p className="text-xs text-emerald-700 mt-1.5 leading-relaxed">
                    🍜 推荐餐饮：
                    {act.foodRecommendation?.shopName ? ` ${act.foodRecommendation.shopName}` : ' 待补充店名'}
                    {act.foodRecommendation?.rating && !isNaN(Number(act.foodRecommendation.rating)) ? `（${Number(act.foodRecommendation.rating).toFixed(1)}分）` : ''}
                    {act.foodRecommendation?.specialty ? ` · 招牌：${act.foodRecommendation.specialty}` : ''}
                    {act.foodRecommendation?.reason ? ` · ${act.foodRecommendation.reason}` : ''}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
