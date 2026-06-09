'use client';

import { DayPlan } from '@/lib/types';
import { sanitizePlanString } from '@/lib/normalize-plan';
import type { TripWeatherPayload } from '@/lib/weather';
import { getDressAndUmbrellaAdvice } from '@/lib/weather-advice';
import { buildAmapNavUrl, buildDianpingUrl, buildMeituanUrl, buildMeituanHotelUrl, buildCtripHotelUrl } from '@/lib/amap-uri';
import { buildCtripFlightUrl, buildQunarFlightUrl } from '@/lib/flight-url';

export default function DayTimeline({
  day,
  tripWeather,
  transportModes,
}: {
  day: DayPlan;
  tripWeather?: TripWeatherPayload | null;
  transportModes?: string[];
}) {
  type WeatherDay = { date: string; condition: string; tempMin: number; tempMax: number; precipProb: number };
  type WeatherRow = { label: string; weather: WeatherDay };
  const dateIso = day.dateIso;
  const dayIndex = Math.max(0, (day.day || 1) - 1);

  const weatherRows: WeatherRow[] = [];
  if (tripWeather?.locations?.length) {
    const dayText = `${day.theme || ''} ${(day.activities || []).map((a) => `${a.activity || ''} ${a.location || ''}`).join(' ')}`;
    const cityEntries = tripWeather.locations.map((loc) => {
      const short = (loc.displayName || loc.query).split('·').pop()?.trim() || loc.query;
      const query = loc.query.replace(/[省市区]$/, '');
      return { loc, short, query };
    });

    const matched = cityEntries.find((c) => dayText.includes(c.query))
      || cityEntries.find((c) => dayText.includes(c.short))
      || cityEntries[0];

    if (matched) {
      const w = dateIso
        ? matched.loc.days.find((d) => d.date === dateIso)
        : matched.loc.days[dayIndex];
      if (w) weatherRows.push({ label: matched.short, weather: w });
    }
  }

  const weatherBits = weatherRows.map(
    (r) => `${r.label} ${r.weather.condition} ${r.weather.tempMin}~${r.weather.tempMax}℃ 降水${r.weather.precipProb}%`,
  );
  const weatherDays = weatherRows.map((r) => r.weather);
  const weatherAdvice = getDressAndUmbrellaAdvice(weatherDays);

  const activities = Array.isArray(day.activities) ? day.activities : [];
  const lastIdx = Math.max(0, activities.length - 1);

  const dayCityHint = (() => {
    const t = day.theme || '';
    const m = t.match(/([\u4e00-\u9fa5]{2,4})(?:一日游|半日游|深度游|游玩|探索|漫步|之旅|市区|海滨|古城|老城|美食|风光)/);
    if (m) return m[1];
    const arr = t.match(/→([\u4e00-\u9fa5]{2,4})$/);
    if (arr) return arr[1];
    const dest = t.match(/(?:抵达|到达|前往|游览)([\u4e00-\u9fa5]{2,4})/);
    if (dest) return dest[1];
    return undefined;
  })();

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
            act.transportInfo?.distance,
            act.transportInfo?.duration,
            act.transportInfo?.priceNote,
          ].filter(Boolean) as string[];
          const hasTransportInfo = transportBits.length > 0;
          const actText = `${act.activity || ''} ${act.notes || ''} ${act.location || ''}`;
          const isFlight = /飞机|航班|飞往|机场|航空|飞行/.test(actText);
          const isDriveText = /自驾|驾车|开车|高速|油费|过路费|服务区|停车/.test(actText);
          const isDriveMode = transportModes?.includes('self_drive') || transportModes?.includes('motorcycle');
          const isDrive = isDriveText || (isDriveMode && !isFlight);
          const transportIcon = isFlight ? '✈️' : isDrive ? '🚗' : '🚄';
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
                      href={buildAmapNavUrl(act.location, dayCityHint)}
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
                      {transportIcon} 交通信息：{transportBits.join(' · ')}
                    </p>
                    {isFlight ? (
                      <>
                        <a
                          href={buildCtripFlightUrl(
                            act.transportInfo?.fromStation || '',
                            act.transportInfo?.toStation || '',
                            dateIso,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition whitespace-nowrap"
                        >
                          ✈️ 携程查航班
                        </a>
                        <a
                          href={buildQunarFlightUrl(
                            act.transportInfo?.fromStation || '',
                            act.transportInfo?.toStation || '',
                            dateIso,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 hover:bg-green-100 px-2 py-0.5 rounded-md transition whitespace-nowrap"
                        >
                          🔍 去哪儿
                        </a>
                      </>
                    ) : !isDrive ? (
                      <a
                        href="https://www.12306.cn/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md transition whitespace-nowrap"
                      >
                        🔍 去12306查车次
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {hasStayInfo ? (
                  <p className="text-xs text-indigo-700 leading-relaxed mt-1.5">
                    🏨 住宿：{act.stayInfo?.hotelName || '酒店待补充'}
                    {(act.stayInfo?.pricePerNight || 0) > 0 ? ` · 约¥${act.stayInfo?.pricePerNight}/晚` : ''}
                    {act.stayInfo?.hotelName && (
                      <span className="ml-1.5 text-gray-400">
                        （<a href={buildDianpingUrl(act.stayInfo.hotelName, dayCityHint)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">大众点评</a>
                        {' / '}
                        <a href={buildMeituanHotelUrl(act.stayInfo.hotelName, dayCityHint)} target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:underline">美团</a>
                        {' / '}
                        <a href={buildCtripHotelUrl(act.stayInfo.hotelName, dayCityHint)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">携程</a>）
                      </span>
                    )}
                  </p>
                ) : null}
                {hasFoodInfo ? (
                  <p className="text-xs text-emerald-700 leading-relaxed mt-1.5">
                    🍜 推荐餐饮：
                    {act.foodRecommendation?.shopName ? ` ${act.foodRecommendation.shopName}` : ' 待补充店名'}
                    {act.foodRecommendation?.rating && !isNaN(Number(act.foodRecommendation.rating)) ? `（${Number(act.foodRecommendation.rating).toFixed(1)}分）` : ''}
                    {act.foodRecommendation?.specialty ? ` · 招牌：${act.foodRecommendation.specialty}` : ''}
                    {act.foodRecommendation?.reason ? ` · ${act.foodRecommendation.reason}` : ''}
                    {act.foodRecommendation?.shopName && (
                      <span className="ml-1.5 text-gray-400">
                        （<a href={buildDianpingUrl(act.foodRecommendation.shopName, dayCityHint)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">大众点评</a>
                        {' / '}
                        <a href={buildMeituanUrl(act.foodRecommendation.shopName, dayCityHint)} target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:underline">美团</a>）
                      </span>
                    )}
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
