import type { TripFormData } from './types';
import { calendarTripDays } from './prompts';

export type WeatherDayPayload = {
  date: string;
  condition: string;
  tempMin: number;
  tempMax: number;
  precipProb: number;
};

export type WeatherLocationPayload = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  days: WeatherDayPayload[];
};

export type TripWeatherPayload = {
  source: 'open-meteo';
  timezone: string;
  note?: string;
  locations: WeatherLocationPayload[];
};

function todayInChina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysStr(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00+08:00`);
  return Number.isFinite(t);
}

type GeoCodingRecord = {
  name?: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  country_code?: string;
  population?: number;
};

/** 限制预报区间长度（Open-Meteo 日预报通常支持约 16 天） */
function capEndDate(start: string, end: string, maxSpanDays: number): string {
  const maxEnd = addDaysStr(start, maxSpanDays - 1);
  return compareIso(end, maxEnd) > 0 ? maxEnd : end;
}

function wmoToCondition(code: number): string {
  if (code === 0) return '晴';
  if (code <= 3) return '多云';
  if (code <= 48) return '阴/雾';
  if (code <= 57) return '毛毛雨';
  if (code <= 67) return '雨';
  if (code <= 77) return '雪/雨夹雪';
  if (code <= 82) return '阵雨';
  if (code <= 86) return '阵雪';
  if (code <= 99) return '雷阵雨';
  return '未知';
}

type GeoHit = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

async function geocodeCityViaAmap(name: string): Promise<GeoHit | null> {
  const key = process.env.AMAP_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) return null;
  try {
    const url = `https://restapi.amap.com/v3/geocode/geo?key=${key}&address=${encodeURIComponent(name)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      geocodes?: Array<{ location: string; formatted_address?: string; province?: string; city?: string }>;
    };
    if (data.status !== '1' || !data.geocodes?.length) return null;
    const g = data.geocodes[0];
    const [lngStr, latStr] = g.location.split(',');
    const lng = parseFloat(lngStr);
    const lat = parseFloat(latStr);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const province = (g.province || '').replace(/省|市$/, '');
    const cityName = typeof g.city === 'string' ? g.city.replace(/市$/, '') : '';
    const displayCity = cityName || g.formatted_address || name;
    return {
      name: displayCity,
      latitude: lat,
      longitude: lng,
      country: 'China',
      admin1: province || undefined,
    };
  } catch {
    return null;
  }
}

async function geocodeCity(name: string): Promise<GeoHit | null> {
  const q = name.trim();
  if (!q) return null;

  // Try AMap first — much more accurate for Chinese city names
  const amapHit = await geocodeCityViaAmap(q);
  if (amapHit) return amapHit;

  // Fallback: Open-Meteo geocoding, pick CN result with highest population
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=zh&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: GeoCodingRecord[] };
    const results = data.results || [];
    if (!results.length) return null;
    const cnResults = results.filter((r) => r.country_code === 'CN' || r.country === 'China');
    let r: GeoCodingRecord;
    if (cnResults.length > 1) {
      r = cnResults.reduce((best, cur) => ((cur.population ?? 0) > (best.population ?? 0) ? cur : best));
    } else {
      r = cnResults[0] || results[0];
    }
    return {
      name: r.name || q,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    };
  } catch {
    return null;
  }
}

async function fetchDailyForecast(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<WeatherDayPayload[]> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lon));
  u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  u.searchParams.set('timezone', 'Asia/Shanghai');
  u.searchParams.set('start_date', startDate);
  u.searchParams.set('end_date', endDate);
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return [];
    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time?.length) return [];
    const days: WeatherDayPayload[] = [];
    for (let i = 0; i < daily.time.length; i++) {
      const code = Number(daily.weather_code?.[i] ?? 0);
      const tMax = daily.temperature_2m_max?.[i];
      const tMin = daily.temperature_2m_min?.[i];
      const pMax = daily.precipitation_probability_max?.[i];
      days.push({
        date: daily.time[i],
        condition: wmoToCondition(Number.isFinite(code) ? code : 0),
        tempMin: Math.round(Number.isFinite(tMin) ? tMin : 0),
        tempMax: Math.round(Number.isFinite(tMax) ? tMax : 0),
        precipProb: Math.round(Math.min(100, Math.max(0, Number.isFinite(pMax) ? pMax : 0))),
      });
    }
    return days;
  } catch {
    return [];
  }
}

function resolveDateRange(formData: TripFormData): { start: string; end: string } | null {
  if (formData.dateMode === 'fixed' && formData.startDate && formData.endDate) {
    if (!isValidIsoDate(formData.startDate) || !isValidIsoDate(formData.endDate)) {
      return null;
    }
    let start = formData.startDate;
    let end = formData.endDate;
    if (compareIso(end, start) < 0) [start, end] = [end, start];
    const span = calendarTripDays(start, end);
    end = span > 16 ? capEndDate(start, end, 16) : end;
    return { start, end };
  }
  if (formData.dateMode === 'flexible_end' && formData.startDate) {
    if (!isValidIsoDate(formData.startDate)) return null;
    const start = formData.startDate;
    const end = capEndDate(start, addDaysStr(start, 9), 10);
    return { start, end };
  }
  const start = todayInChina();
  const end = addDaysStr(start, 6);
  return { start, end };
}

function resolveWeatherQueries(formData: TripFormData): { names: string[]; note?: string } {
  const isMountainRun = formData.preferences?.motoRideType === 'mountain_run';

  // Mountain run: weather based on departure city (destinations are just direction hints)
  if (isMountainRun) {
    const dep = formData.departure?.trim();
    if (!dep) return { names: [] };
    return { names: [dep.replace(/市$/, '') || dep] };
  }

  if (formData.destinationMode === 'specific' && formData.destinations?.length) {
    const names = formData.destinations
      .flatMap((d) => String(d).split(/[、,，]/g))
      .map((x) => x.trim())
      .filter(Boolean);
    return { names: [...new Set(names)].slice(0, 5) };
  }
  const dep = formData.departure?.trim();
  if (!dep) return { names: [] };
  return {
    names: [dep.replace(/市$/, '') || dep],
    note: '目的地尚未在表单中具体选定，以下为出发地附近坐标对应的天气趋势，供穿衣与行程参考；确定目的地后重新生成可得更准预报。',
  };
}

/**
 * 使用 Open-Meteo（无需 API Key）拉取目的地日预报，供提示词与前端展示。
 */
export async function fetchTripWeatherForPlan(formData: TripFormData): Promise<{
  promptText: string;
  payload: TripWeatherPayload;
}> {
  const emptyPayload: TripWeatherPayload = {
    source: 'open-meteo',
    timezone: 'Asia/Shanghai',
    locations: [],
  };

  try {
  const range = resolveDateRange(formData);
  if (!range) {
    return { promptText: '', payload: emptyPayload };
  }

  const { names, note } = resolveWeatherQueries(formData);
  if (!names.length) {
    return { promptText: '', payload: { ...emptyPayload, note } };
  }

  const locResults = await Promise.all(
    names.map(async (rawName) => {
      const geo = await geocodeCity(rawName);
      if (!geo) return null;
      const admin1Clean = geo.admin1?.replace(/[省市区]$/, '') || '';
      const nameClean = geo.name?.replace(/[省市区]$/, '') || '';
      const showAdmin = admin1Clean && admin1Clean !== nameClean && !nameClean.includes(admin1Clean);
      const displayName = showAdmin ? `${geo.admin1} · ${geo.name}` : geo.name;
      const days = await fetchDailyForecast(geo.latitude, geo.longitude, range.start, range.end);
      if (!days.length) return null;
      return {
        query: rawName,
        displayName,
        latitude: geo.latitude,
        longitude: geo.longitude,
        days,
      } satisfies WeatherLocationPayload;
    })
  );
  const locations = locResults.filter((x): x is WeatherLocationPayload => x != null);

  const payload: TripWeatherPayload = {
    source: 'open-meteo',
    timezone: 'Asia/Shanghai',
    note,
    locations,
  };

  if (!locations.length) {
    return { promptText: '', payload };
  }

  const lines: string[] = [];
  for (const loc of locations) {
    const dayStr = loc.days
      .map(
        (d) =>
          `${d.date} ${d.condition} ${d.tempMin}~${d.tempMax}℃ 降水概率${d.precipProb}%`
      )
      .join('；');
    lines.push(`- ${loc.displayName}（查询词：${loc.query}）：${dayStr}`);
  }
  let promptText = lines.join('\n');
  if (note) promptText += `\n- 说明：${note}`;
  if (promptText.length > 2200) promptText = promptText.slice(0, 2200) + '…';

  return { promptText, payload };
  } catch (e) {
    console.error('[weather] fetchTripWeatherForPlan:', e);
    return { promptText: '', payload: emptyPayload };
  }
}
