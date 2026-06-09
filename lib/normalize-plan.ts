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

const MUSEUM_KEYWORDS = [
  '博物馆', '博物院', '纪念馆', '美术馆', '艺术馆', '陈列馆',
  '展览馆', '科技馆', '规划馆', '看展', '特展', '文化展览',
];

/**
 * 从单次对话里推断否决项（表单 mustAvoid 未填时，聊天里口头说的也要生效）。
 */
export function inferMustAvoidFromChatMessage(text: string): string {
  const m = text.replace(/\s+/g, ' ').trim();
  if (!m) return '';
  const parts: string[] = [];
  if (
    /(不去|不要|不想|拒绝|别|取消|去掉|删掉|移除).{0,16}(博物馆|博物院|纪念馆|美术馆|艺术馆|看展)/.test(m) ||
    /(博物馆|博物院|纪念馆|美术馆|艺术馆).{0,10}(不去|不要|不想|拒绝|别|去掉|删掉|移除)/.test(m) ||
    /不去任何博物馆|不看展|不看博物馆|没有博物馆|别安排博物馆/.test(m)
  ) {
    parts.push('不去任何博物馆');
  }
  if (/(不去|不要|不想).{0,10}(爬山|登山|徒步上山)/.test(m) || /(爬山|登山).{0,6}(不去|不要)/.test(m)) {
    parts.push('不想爬山');
  }
  if (/(不去|不要|不想).{0,10}古镇/.test(m)) {
    parts.push('不去古镇');
  }
  return parts.join('；');
}

function buildAvoidPatterns(mustAvoid: string): RegExp[] {
  const patterns: RegExp[] = [];
  const lower = mustAvoid.toLowerCase();
  if (/(博物馆|博物院|纪念馆|美术馆|艺术馆|展览|看展)/.test(lower)) {
    patterns.push(new RegExp(MUSEUM_KEYWORDS.join('|'), 'i'));
  }
  if (/(爬山|登山|徒步上山)/.test(lower)) {
    patterns.push(/爬山|登山|徒步上山|攀登/i);
  }
  if (/(古镇|商业化古镇)/.test(lower)) {
    patterns.push(/古镇/i);
  }
  return patterns;
}

/**
 * Post-process: remove activities matching user's mustAvoid keywords.
 * Returns the number of activities removed.
 */
export function filterMustAvoidActivities(
  plans: any[],
  mustAvoid: string | undefined | null,
): number {
  if (!mustAvoid?.trim() || !Array.isArray(plans)) return 0;
  const patterns = buildAvoidPatterns(mustAvoid);
  if (patterns.length === 0) return 0;

  let removed = 0;

  for (const plan of plans) {
    const itinerary = Array.isArray(plan?.itinerary) ? plan.itinerary : [];
    for (const day of itinerary) {
      const acts = Array.isArray(day?.activities) ? day.activities : [];
      day.activities = acts.filter((a: any) => {
        const text = `${a?.activity || ''} ${a?.location || ''} ${a?.notes || ''}`;
        const hit = patterns.some(p => p.test(text));
        if (hit) removed++;
        return !hit;
      });
    }

    if (Array.isArray(plan?.attractions)) {
      plan.attractions = plan.attractions.filter((a: any) => {
        const text = `${a?.name || ''} ${a?.description || ''} ${a?.category || ''}`;
        return !patterns.some(p => p.test(text));
      });
    }
  }

  return removed;
}

/**
 * Detect and fix "premature return" pattern:
 * AI returns home on D(n-1) then fills D(n) with filler like "自由活动/整理行李".
 * Fix: move return to last day, give freed day to last destination for deep exploration.
 */
export function fixPrematureReturn(plans: any[], departure: string): number {
  let fixed = 0;
  const depCity = departure
    .replace(/(京旺家园|家园|花园|小区|公寓|大厦|中心|广场|大道|路|街|号|栋|室|市|区|县|镇|村).*$/g, '')
    .trim() || departure.slice(0, 2);

  for (const plan of plans) {
    const itinerary = plan?.itinerary;
    if (!Array.isArray(itinerary) || itinerary.length < 3) continue;

    const lastIdx = itinerary.length - 1;
    const prevIdx = lastIdx - 1;
    const lastDay = itinerary[lastIdx];
    const prevDay = itinerary[prevIdx];
    const lastActs: any[] = Array.isArray(lastDay?.activities) ? lastDay.activities : [];
    const prevActs: any[] = Array.isArray(prevDay?.activities) ? prevDay.activities : [];

    if (lastActs.length === 0 || prevActs.length === 0) continue;

    const fillerRe = /自由活动|整理行李|准备返程|结束行程|返程准备|休整|收拾行囊/;
    const isLastFiller =
      lastActs.length <= 3 &&
      lastActs.every((a: any) => fillerRe.test(`${a?.activity || ''} ${a?.notes || ''}`));
    if (!isLastFiller) continue;

    const returnRe = new RegExp(
      `(返回|自驾.*${depCity}|→\\s*${depCity}|回${depCity}|前往${depCity}|抵达${depCity})`,
    );
    const hasReturn = prevActs.some((a: any) =>
      returnRe.test(`${a?.activity || ''} ${a?.location || ''}`),
    );
    if (!hasReturn) continue;

    let lastCity = '';
    for (let i = prevIdx - 1; i >= 0 && !lastCity; i--) {
      for (const a of itinerary[i]?.activities || []) {
        const loc = (a?.location || '').split(/[→·\-（(,，]/)[0].trim();
        if (
          loc &&
          loc.length >= 2 &&
          !new RegExp(depCity).test(loc) &&
          !/途中|服务区|高速|收费站/.test(loc)
        ) {
          lastCity = loc;
          break;
        }
      }
    }
    if (!lastCity) {
      const theme = (itinerary[prevIdx - 1]?.theme || '').split(/[→·\-]/)[0].trim();
      lastCity = theme && theme.length >= 2 ? theme : '目的地';
    }

    console.log(
      `[fixPrematureReturn] D${prevDay.day} returns to ${depCity}, D${lastDay.day} is filler. Swapping: D${prevDay.day}→${lastCity}深度游, D${lastDay.day}→返程`,
    );

    itinerary[lastIdx] = {
      ...lastDay,
      theme: prevDay.theme || `${lastCity}→${depCity}·返程`,
      activities: prevActs,
    };

    itinerary[prevIdx] = {
      ...prevDay,
      theme: `${lastCity}·深度游`,
      activities: [
        { time: '09:00', activity: `游览${lastCity}市区景点`, location: lastCity, duration: '约2小时', cost: 0, notes: `深度探索${lastCity}` },
        { time: '11:30', activity: '午餐', location: `${lastCity}市内`, duration: '约1小时', cost: 80, notes: '当地特色美食' },
        { time: '13:30', activity: `${lastCity}特色体验`, location: lastCity, duration: '约2小时', cost: 0 },
        { time: '16:00', activity: `逛${lastCity}特色街区`, location: lastCity, duration: '约1.5小时', cost: 0 },
        { time: '18:00', activity: '晚餐', location: `${lastCity}市内`, duration: '约1.5小时', cost: 100, notes: '当地特色餐厅' },
        { time: '20:00', activity: `夜游${lastCity}`, location: lastCity, duration: '约1小时', cost: 0 },
      ],
    };

    fixed++;
  }
  return fixed;
}

/**
 * Chain fast-food / coffee / generic chain restaurant keywords. AI shouldn't
 * recommend these when users travel (they can get the same food at home).
 */
const CHAIN_FOOD_KEYWORDS = [
  '肯德基', 'KFC', 'kfc',
  '麦当劳', "McDonald", 'mcdonald',
  '必胜客', 'Pizza Hut',
  '德克士',
  '汉堡王', 'Burger King',
  '星巴克', 'Starbucks',
  '瑞幸', 'Luckin',
  '华莱士',
  '沙县小吃',
  '黄焖鸡米饭',
  '杨铭宇',
  '正新鸡排',
  '永和豆浆', '永和大王',
  '大娘水饺',
  '真功夫',
  '吉野家',
  '赛百味', 'Subway',
  'COSTA',
  'Tims',
];

function isChainFood(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return CHAIN_FOOD_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
}

/** Normalize a restaurant name into a brand key by stripping parenthesized
 * branch info and whitespace, so we can detect same-brand duplicates across
 * days (e.g. "遇龙闽粤菜(滨北店)" and "遇龙闽粤菜(鹭江店)" collapse to the
 * same key). */
function restaurantBrandKey(name: string): string {
  return name
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Post-process: strip chain fast-food recommendations and dedupe same-brand
 * restaurants across days. Mutates plans in place.
 */
export function filterChainFoodAndDedupe(plans: unknown[]): {
  chainRemoved: number;
  dedupedCount: number;
} {
  let chainRemoved = 0;
  let dedupedCount = 0;
  if (!Array.isArray(plans)) return { chainRemoved, dedupedCount };

  for (const plan of plans as Array<Record<string, unknown>>) {
    const itinerary = Array.isArray(plan?.itinerary) ? (plan.itinerary as any[]) : [];
    const seenBrands = new Set<string>();

    for (const day of itinerary) {
      const acts = Array.isArray(day?.activities) ? day.activities : [];
      for (const act of acts) {
        const fr = act?.foodRecommendation;
        const name: string = fr?.shopName || '';
        if (!name) continue;

        if (isChainFood(name)) {
          delete act.foodRecommendation;
          const hint = '建议就近找本地特色高分店';
          const notes = String(act.notes || '').trim();
          if (!notes) act.notes = hint;
          else if (!/本地|特色|高分|大众点评|觅食/.test(notes)) act.notes = `${notes}；${hint}`;
          chainRemoved++;
          continue;
        }

        const key = restaurantBrandKey(name);
        if (!key || key.length < 2) continue;

        if (seenBrands.has(key)) {
          delete act.foodRecommendation;
          const hint = '建议换家本地菜，可在大众点评搜同区域高分店';
          const notes = String(act.notes || '').trim();
          if (!notes) act.notes = hint;
          else if (!/换家|不同餐厅|别家|另找/.test(notes)) act.notes = `${notes}；${hint}`;
          dedupedCount++;
        } else {
          seenBrands.add(key);
        }
      }
    }

    const foodSpots = Array.isArray(plan?.food_spots) ? (plan.food_spots as any[]) : [];
    plan.food_spots = foodSpots.filter((f) => {
      if (isChainFood(f?.name || '')) {
        chainRemoved++;
        return false;
      }
      return true;
    });
  }

  return { chainRemoved, dedupedCount };
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
