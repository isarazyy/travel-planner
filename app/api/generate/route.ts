import { NextRequest, NextResponse } from 'next/server';
import { callQwen, parseJsonResponse } from '@/lib/qwen';
import { buildMultiPlanPrompt, calendarTripDays } from '@/lib/prompts';
import { buildHotelWebContextForPrompt } from '@/lib/hotel-web-search';
import { fetchTripWeatherForPlan } from '@/lib/weather';
import { TripFormData } from '@/lib/types';
import {
  ensureAttractions,
  ensureItineraryMatchesDates,
  normalizeItinerary,
  normalizeTips,
} from '@/lib/normalize-plan';
import { sanitizeTransportPlan } from '@/lib/transport-sanity';
import { streamWithKeepAlive, sseHeaders } from '@/lib/stream-response';

/** 勿用用户输入顺序冒充推荐路线；仅表示「包含这些地点」。 */
function fallbackRecommendedRoute(destinations: string[] | undefined): string {
  if (!destinations?.length) return 'AI 推荐路线';
  if (destinations.length === 1) return `${destinations[0]}（单点深度游）`;
  return `含：${destinations.join('、')}（游览顺序见下方「推荐路线」与每日行程，非输入顺序）`;
}

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function estimateCostBreakdown(p: any) {
  const itinerary = Array.isArray(p?.itinerary) ? p.itinerary : [];
  const accommodations = Array.isArray(p?.accommodations) ? p.accommodations : [];
  const foodSpots = Array.isArray(p?.foodSpots) ? p.foodSpots : [];

  let transport = 0;
  let accommodation = 0;
  let food = 0;
  let attractions = 0;

  for (const day of itinerary) {
    for (const act of day?.activities || []) {
      const c = toNum(act?.cost);
      if (c > 0) attractions += c;
    }
  }
  for (const a of accommodations) {
    const c = toNum(a?.pricePerNight);
    if (c > 0) accommodation += c;
  }
  for (const f of foodSpots) {
    const c = toNum(f?.avgCost);
    if (c > 0) food += c;
  }

  // Rough defaults when model omits category costs
  const dayCount = Math.max(1, itinerary.length || 1);
  if (food === 0) food = dayCount * 120;
  if (accommodation === 0) accommodation = Math.max(1, dayCount - 1) * 260;
  if (attractions === 0) attractions = dayCount * 80;
  if (transport === 0) transport = dayCount * 120;

  const other = Math.round((food + attractions) * 0.08);
  const total = transport + accommodation + food + attractions + other;
  return { transport, accommodation, food, attractions, other, total };
}

function normalizeAccommodations(list: any[]): any[] {
  if (!Array.isArray(list)) return [];
  return list.map((a) => {
    const name = typeof a?.name === 'string' ? a.name : '';
    const area = typeof a?.area === 'string' ? a.area : '';
    const pros = Array.isArray(a?.pros) ? a.pros.filter((x: unknown) => typeof x === 'string') : [];
    const cons = Array.isArray(a?.cons) ? a.cons.filter((x: unknown) => typeof x === 'string') : [];
    const searchKeyword =
      typeof a?.searchKeyword === 'string' && a.searchKeyword.trim()
        ? a.searchKeyword.trim()
        : `${area} ${name}`.trim() || name;
    return {
      ...a,
      name,
      type: typeof a?.type === 'string' ? a.type : '',
      pricePerNight: toNum(a?.pricePerNight),
      area,
      highlights: typeof a?.highlights === 'string' ? a.highlights : '',
      pros,
      cons,
      webNote: typeof a?.webNote === 'string' ? a.webNote : '',
      searchKeyword,
    };
  });
}

function normalizePlanCosts(p: any) {
  const ai = p?.costBreakdown || {};
  const transport = toNum(ai.transport);
  const accommodation = toNum(ai.accommodation);
  const food = toNum(ai.food);
  const attractions = toNum(ai.attractions);
  const other = toNum(ai.other);
  let total = toNum(ai.total);

  const allZero = transport + accommodation + food + attractions + other + total <= 0;
  if (allZero) {
    const est = estimateCostBreakdown(p);
    return { cost_breakdown: est, estimated_total: est.total };
  }

  if (total <= 0) total = transport + accommodation + food + attractions + other;
  if (total <= 0) {
    const est = estimateCostBreakdown(p);
    return { cost_breakdown: est, estimated_total: est.total };
  }

  return {
    cost_breakdown: { transport, accommodation, food, attractions, other, total },
    estimated_total: total,
  };
}

/** 长行程需要更多输出 token，避免 JSON 截断导致 itinerary 只有几天 */
function computeMaxTokens(isFast: boolean, dayCount: number | null): number {
  if (dayCount == null || dayCount <= 0) {
    return isFast ? 2400 : 4000;
  }
  const planSlots = isFast ? 1 : 2;
  const perDay = isFast ? 150 : 260;
  const base = isFast ? 1100 : 1500;
  let raw = base + dayCount * perDay * planSlots;
  if (!isFast && planSlots >= 2) raw = Math.round(raw * 1.12);
  /** 多数对话 API 单次输出上限约 8k，避免请求被拒 */
  const cap = isFast ? 8000 : 8192;
  const floor = isFast ? 2400 : 4800;
  return Math.min(cap, Math.max(floor, raw));
}

function computeTimeoutMs(isFast: boolean, dayCount: number | null): number {
  const base = isFast ? 40000 : 70000;
  const extra = (dayCount ?? 0) * 2800;
  return Math.min(isFast ? 100000 : 140000, base + extra);
}

export async function POST(request: NextRequest) {
  let formData: TripFormData;
  try {
    formData = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!formData.departure) {
    return NextResponse.json({ error: '请填写出发地' }, { status: 400 });
  }
  if (formData.destinationMode === 'specific' && (!formData.destinations || formData.destinations.length === 0)) {
    return NextResponse.json({ error: '请至少填写一个目的地，或切换到智能推荐模式' }, { status: 400 });
  }
  if (formData.destinationMode === 'theme' && (!formData.destinationThemes?.length && !formData.destinationHint?.trim())) {
    return NextResponse.json({ error: '请选择至少一个出游类型，或填写你的想法' }, { status: 400 });
  }
  if (formData.dateMode === 'fixed' && (!formData.startDate || !formData.endDate)) {
    return NextResponse.json({ error: '请填写出发和返回日期' }, { status: 400 });
  }
  if (formData.dateMode === 'flexible_end' && !formData.startDate) {
    return NextResponse.json({ error: '请填写出发日期' }, { status: 400 });
  }
  const modes = formData.preferences.transportModes;
  if (!modes || modes.length === 0) {
    return NextResponse.json({ error: '请至少选择一种出行方式' }, { status: 400 });
  }

  const isFast = formData.generationMode === 'fast';
  const lockedDayCount =
    formData.dateMode === 'fixed' && formData.startDate && formData.endDate
      ? calendarTripDays(formData.startDate, formData.endDate)
      : null;

  const applyFixedDates = (it: ReturnType<typeof normalizeItinerary>) => {
    if (formData.dateMode === 'fixed' && formData.startDate && formData.endDate) {
      return ensureItineraryMatchesDates(it, formData.startDate, formData.endDate);
    }
    return it;
  };

  const buildResult = (parsed: any, hotelWebSearchUsed: boolean, weatherPayload: any, fallbackUsed = false) => {
    const plans = (parsed.plans || []).map((p: any) => {
      const normalized = normalizePlanCosts(p);
      let itinerary = applyFixedDates(normalizeItinerary(p.itinerary));
      const transportFixed = sanitizeTransportPlan({
        transport_detail: p.transportDetail || '',
        itinerary,
      });
      itinerary = transportFixed.itinerary;
      return {
        planName: p.planName || (fallbackUsed ? '精简可执行版' : '未命名方案'),
        planDescription: p.planDescription || (fallbackUsed ? '系统自动降级重试生成' : ''),
        transport_detail: transportFixed.transport_detail,
        itinerary,
        attractions: ensureAttractions(p.attractions, itinerary),
        accommodations: normalizeAccommodations(p.accommodations || []),
        food_spots: p.foodSpots || [],
        cost_breakdown: normalized.cost_breakdown,
        estimated_total: normalized.estimated_total,
        tips: normalizeTips(p.tips),
      };
    });
    const routeRaw = parsed.recommendedRoute || fallbackRecommendedRoute(formData.destinations);
    return {
      hotelWebSearchUsed,
      trip: {
        departure: formData.departure,
        destinations: formData.destinations,
        date_mode: formData.dateMode,
        start_date: formData.startDate || '',
        end_date: formData.endDate || '',
        people_count: formData.peopleCount,
        preferences: formData.preferences,
      },
      recommendations: {
        route: routeRaw,
        days: lockedDayCount !== null ? lockedDayCount : parsed.recommendedDays ?? null,
        season: parsed.recommendedSeason || null,
        nearbySuggestions: typeof parsed.nearbySuggestions === 'string' ? parsed.nearbySuggestions : null,
        weather: weatherPayload.locations.length > 0 ? weatherPayload : null,
      },
      plans,
      ...(fallbackUsed ? { fallbackUsed: true } : {}),
    };
  };

  const stream = streamWithKeepAlive(async () => {
    const emptyWeather = {
      promptText: '',
      payload: { source: 'open-meteo' as const, timezone: 'Asia/Shanghai', locations: [] },
    };
    const [hotelRes, weatherRes] = await Promise.allSettled([
      buildHotelWebContextForPrompt(formData),
      fetchTripWeatherForPlan(formData),
    ]);
    if (hotelRes.status === 'rejected') console.error('[generate] hotel web context failed:', hotelRes.reason);
    if (weatherRes.status === 'rejected') console.error('[generate] weather fetch failed:', weatherRes.reason);

    const hotelWebContext = hotelRes.status === 'fulfilled' ? hotelRes.value.contextText : '';
    const hotelWebSearchUsed = hotelRes.status === 'fulfilled' ? hotelRes.value.used : false;
    const { promptText: weatherContext, payload: weatherPayload } =
      weatherRes.status === 'fulfilled' ? weatherRes.value : emptyWeather;

    const prompt = buildMultiPlanPrompt(formData, { hotelWebContext, weatherContext });
    const maxTokens = computeMaxTokens(isFast, lockedDayCount);
    const timeoutMs = computeTimeoutMs(isFast, lockedDayCount);

    try {
      const raw = await callQwen(prompt, {
        maxTokens,
        temperature: isFast ? 0.2 : 0.4,
        timeoutMs,
        model: isFast ? 'qwen-turbo' : 'qwen-plus',
      });
      return buildResult(parseJsonResponse(raw), hotelWebSearchUsed, weatherPayload);
    } catch (err: any) {
      const msg = String(err?.message || '');
      const shouldRetry = msg.includes('超时') || msg.includes('timeout') || msg.includes('Abort');
      if (!shouldRetry) throw err;

      console.error('Qwen first attempt timed out, retrying with turbo…');
      const fbDays = lockedDayCount ?? 7;
      const fallbackPrompt = `${prompt}\n\n【降级重试要求】\n请只返回1个最可执行方案。若用户为固定日期，itinerary 必须恰好覆盖从出发到返程的每一天（day 连续、每天一条），可压缩每日活动条数但不可漏天。`;
      const raw = await callQwen(fallbackPrompt, {
        maxTokens: Math.min(8192, Math.max(3200, 900 + fbDays * 220)),
        temperature: 0.2,
        timeoutMs: Math.min(110000, 45000 + fbDays * 2500),
        model: 'qwen-turbo',
      });
      return buildResult(parseJsonResponse(raw), hotelWebSearchUsed, weatherPayload, true);
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}
