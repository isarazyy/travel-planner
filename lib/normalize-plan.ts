import type { Attraction, DayActivity, DayPlan } from '@/lib/types';
import { enumerateTripDatesInclusive, formatCnDateWithWeekday } from '@/lib/date-utils';

/** 去掉模型/解析层产生的 undefined、null 字面量与空串 */
export function sanitizePlanString(v: unknown, fallback: string): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return fallback;
  return s;
}

function activityCost(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function safeText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s === 'undefined' || s === 'null') return undefined;
  return s;
}

const DEFAULT_TIPS = [
  '出发前核对证件、车票与主要景点/博物馆的预约与开闭馆时间。',
  '跨省、跨市交通以12306、客运站或航空公司官方信息为准，勿轻信不符合地图距离的「超短车程」表述。',
  '本方案中的车次号、发到时刻与铁路票价仅为规划示意时可能不完整；购票前务必在12306官网或官方App按出行日期重新查询。',
];

export function normalizeTips(tips: unknown): string[] {
  const raw = Array.isArray(tips) ? tips : [];
  const cleaned = raw
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((t) => t && t !== 'undefined' && t !== 'null');
  if (cleaned.length >= 2) return cleaned;
  const out = [...cleaned];
  for (const d of DEFAULT_TIPS) {
    if (out.length >= 2) break;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

export function normalizeItinerary(itinerary: unknown): DayPlan[] {
  if (!Array.isArray(itinerary)) return [];
  return itinerary.map((day: Record<string, unknown>, idx: number) => {
    const acts = Array.isArray(day?.activities) ? day.activities : [];
    const activities: DayActivity[] = (acts as Record<string, unknown>[]).map((a) => {
      const notesRaw = a?.notes;
      const notesStr = typeof notesRaw === 'string' ? notesRaw.trim() : '';
      const notes =
        notesStr && notesStr !== 'undefined' && notesStr !== 'null' ? notesStr : undefined;
      const row: DayActivity = {
        time: sanitizePlanString(a?.time, '—'),
        activity: sanitizePlanString(a?.activity, '活动待补充'),
        location: sanitizePlanString(a?.location, '地点待补充'),
        duration: sanitizePlanString(a?.duration, '时长待定'),
        cost: activityCost(a?.cost),
      };
      const t = (a?.transportInfo || {}) as Record<string, unknown>;
      const transportInfo = {
        fromStation: safeText(t.fromStation),
        toStation: safeText(t.toStation),
        trainNo: safeText(t.trainNo),
        departTime: safeText(t.departTime),
        arriveTime: safeText(t.arriveTime),
        duration: safeText(t.duration),
        priceNote: safeText(t.priceNote),
      };
      if (Object.values(transportInfo).some(Boolean)) row.transportInfo = transportInfo;

      const st = (a?.stayInfo || {}) as Record<string, unknown>;
      const stayInfo = {
        hotelName: safeText(st.hotelName),
        pricePerNight: activityCost(st.pricePerNight),
      };
      if (stayInfo.hotelName || stayInfo.pricePerNight > 0) row.stayInfo = stayInfo;

      const fd = (a?.foodRecommendation || {}) as Record<string, unknown>;
      const ratingNum = Number(fd.rating);
      const foodRecommendation = {
        shopName: safeText(fd.shopName),
        rating: Number.isFinite(ratingNum) ? Math.max(0, Math.min(5, ratingNum)) : undefined,
        specialty: safeText(fd.specialty),
        reason: safeText(fd.reason),
      };
      if (Object.values(foodRecommendation).some((x) => x !== undefined && x !== '')) {
        row.foodRecommendation = foodRecommendation;
      }
      if (notes) row.notes = notes;
      return row;
    });
    if (activities.length === 0) {
      activities.push({
        time: '—',
        activity: '当日行程待补充',
        location: '—',
        duration: '—',
        cost: 0,
      });
    }
    const d = day?.day;
    const dayNum = typeof d === 'number' && Number.isFinite(d) ? d : idx + 1;
    const rawDate = day?.dateIso ?? day?.date;
    const dateIso =
      typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate).trim())
        ? String(rawDate).trim()
        : undefined;
    const row: DayPlan = {
      day: dayNum,
      date: sanitizePlanString(day?.date, ''),
      theme: sanitizePlanString(day?.theme, `第 ${dayNum} 天`),
      activities,
    };
    if (dateIso) row.dateIso = dateIso;
    return row;
  });
}

/**
 * 固定出发～返回时：强制每日数量与日历一致；不足则补占位日，超出则截断；并写入 dateIso 供天气对齐。
 */
export function ensureItineraryMatchesDates(
  itinerary: DayPlan[],
  startIso: string,
  endIso: string
): DayPlan[] {
  const dates = enumerateTripDatesInclusive(startIso, endIso);
  if (dates.length === 0) return itinerary;

  const days: DayPlan[] =
    itinerary.length > dates.length ? itinerary.slice(0, dates.length) : [...itinerary];

  while (days.length < dates.length) {
    const i = days.length;
    const iso = dates[i];
    days.push({
      day: i + 1,
      date: formatCnDateWithWeekday(iso),
      dateIso: iso,
      theme: '自由活动日',
      activities: [
        {
          time: '全天',
          activity: '自由活动，可在当地随意探索',
          location: '当日停留区域',
          duration: '自由安排',
          cost: 0,
          notes: '可在下方对话框让 AI 帮你补充具体安排',
        },
      ],
    });
  }

  return days.map((d, idx) => {
    const iso = dates[idx];
    return {
      ...d,
      day: idx + 1,
      date: formatCnDateWithWeekday(iso),
      dateIso: iso,
    };
  });
}

function isTransitLike(text: string): boolean {
  return /(抵达|返程|结束旅程|乘坐|转乘|中转|高铁|火车|动车|大巴|机场|车站|入住酒店)/.test(text);
}

/** 当模型 attractions 太少时，从 itinerary 提炼可玩的去处作兜底推荐 */
export function ensureAttractions(
  attractions: unknown,
  itinerary: DayPlan[],
  minCount = 6
): Attraction[] {
  const base: Attraction[] = Array.isArray(attractions)
    ? attractions
        .map((a: Record<string, unknown>) => ({
          name: sanitizePlanString(a?.name, ''),
          description: sanitizePlanString(a?.description, ''),
          category: sanitizePlanString(a?.category, '景点/体验'),
          duration: sanitizePlanString(a?.duration, '约1-2小时'),
          cost: activityCost(a?.cost),
        }))
        .filter((a) => !!a.name)
    : [];
  if (base.length >= minCount) return base;

  const seen = new Set(base.map((a) => a.name));
  for (const day of itinerary) {
    for (const act of day.activities || []) {
      const actName = sanitizePlanString(act.activity, '');
      const loc = sanitizePlanString(act.location, '');
      const key = loc || actName;
      const text = `${actName} ${loc}`.trim();
      if (!key || isTransitLike(text) || seen.has(key)) continue;
      seen.add(key);
      base.push({
        name: key,
        description: actName || `来自第${day.day}天行程`,
        category: '行程去处',
        duration: sanitizePlanString(act.duration, '约1-2小时'),
        cost: activityCost(act.cost),
      });
      if (base.length >= minCount) return base;
    }
  }
  return base;
}
