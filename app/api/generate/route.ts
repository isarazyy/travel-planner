import { NextRequest, NextResponse } from 'next/server';
import { callQwen, parseJsonResponse } from '@/lib/qwen';
import { resolveGenerateModel } from '@/lib/qwen-models';
import { buildMultiPlanPrompt, calendarTripDays } from '@/lib/prompts';
import { buildHotelWebContextForPrompt } from '@/lib/hotel-web-search';
import { buildTransportFoodWebContextForPrompt } from '@/lib/trip-web-search';
import { fetchTripWeatherForPlan, backfillWeatherFromResult } from '@/lib/weather';
import { TripFormData } from '@/lib/types';
import { compareIso } from '@/lib/date-utils';
import {
  ensureAttractions,
  ensureItineraryMatchesDates,
  normalizeItinerary,
  normalizeTips,
} from '@/lib/normalize-plan';
import { sanitizeTransportPlan } from '@/lib/transport-sanity';
import { streamWithKeepAlive, sseHeaders } from '@/lib/stream-response';
import { getOptionalUser } from '@/lib/optional-auth';
import { saveGeneratedTrip, type GeneratedStreamPayload } from '@/lib/save-trip';
import { checkUsageLimit, setGuestUsageCookie, recordUsage } from '@/lib/usage-limit';
import { getLastQwenUsage } from '@/lib/qwen';
import { collectRealDataForTrip } from '@/lib/amap-data-collector';
import { postEnrichTransitData } from '@/lib/post-enrich-transit';
import { backfillDrivingData } from '@/lib/backfill-driving';
import { optimizeRoute } from '@/lib/route-optimizer';
import { createJob, updateJobStatus } from '@/lib/generation-job';

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

function isRangeString(v: any): v is string {
  return typeof v === 'string' && /^\d+-\d+$/.test(v.trim());
}

function numToRange(n: number): string {
  if (n <= 0) return '0';
  const lo = Math.round(n * 0.85 / 50) * 50;
  const hi = Math.round(n * 1.15 / 50) * 50;
  return `${Math.max(0, lo)}-${hi}`;
}

function normalizePlanCosts(p: any) {
  const ai = p?.costBreakdown || {};

  const hasRange = ['transport', 'accommodation', 'food', 'attractions', 'other', 'total']
    .some(k => isRangeString(ai[k]));

  if (hasRange) {
    const pass = (v: any): string => {
      if (isRangeString(v)) return v.trim();
      const n = toNum(v);
      return numToRange(n);
    };
    const cb = {
      transport: pass(ai.transport),
      accommodation: pass(ai.accommodation),
      food: pass(ai.food),
      attractions: pass(ai.attractions),
      other: pass(ai.other),
      total: pass(ai.total),
    };
    return { cost_breakdown: cb, estimated_total: cb.total };
  }

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

  const cb = {
    transport: numToRange(transport),
    accommodation: numToRange(accommodation),
    food: numToRange(food),
    attractions: numToRange(attractions),
    other: numToRange(other),
    total: numToRange(total),
  };
  return { cost_breakdown: cb, estimated_total: cb.total };
}

/** 长行程需要更多输出 token，避免 JSON 截断导致 itinerary 只有几天 */
/**
 * Token budget by trip length. Long trips (>10d) rely on prompt telling AI
 * to write fewer activities per day, so perDay is kept moderate.
 *
 * Approximate needs (measured):
 *   fast  1d ~2000 | 3d ~3000 | 7d ~4500 | 14d ~6500
 *   std   1d ~3500 | 3d ~5000 | 7d ~7500 | 14d ~11000
 */
function computeMaxTokens(isFast: boolean, dayCount: number | null): number {
  const days = dayCount != null && dayCount > 0 ? dayCount : 5;
  const planSlots = isFast ? 1 : 2;
  const perDay = days > 10 ? (isFast ? 400 : 450) : (isFast ? 550 : 600);
  const base = isFast ? 2800 : 3500;
  let raw = base + days * perDay * planSlots;
  if (!isFast && planSlots >= 2) raw = Math.round(raw * 1.05);
  const cap = isFast ? 16000 : 20000;
  const floor = isFast ? 5500 : 8000;
  return Math.min(cap, Math.max(floor, raw));
}

/** Timeout scales with token budget: ~12ms per token + 25s base overhead */
function computeTimeoutMs(isFast: boolean, dayCount: number | null): number {
  const tokens = computeMaxTokens(isFast, dayCount);
  const ms = 25000 + tokens * 12;
  return Math.min(150000, ms);
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
  if (
    formData.dateMode === 'fixed' &&
    formData.startDate &&
    formData.endDate &&
    compareIso(formData.endDate, formData.startDate) < 0
  ) {
    return NextResponse.json({ error: '返程日期不能早于出发日期' }, { status: 400 });
  }
  if (formData.dateMode === 'flexible_end' && !formData.startDate) {
    return NextResponse.json({ error: '请填写出发日期' }, { status: 400 });
  }
  // Server-side input length limits to prevent abuse
  if (formData.departure && formData.departure.length > 50) formData.departure = formData.departure.slice(0, 50);
  if (formData.destinations) {
    formData.destinations = formData.destinations.slice(0, 10).map((d: string) =>
      typeof d === 'string' && d.length > 50 ? d.slice(0, 50) : d,
    );
  }
  if (formData.destinationHint && formData.destinationHint.length > 200) formData.destinationHint = formData.destinationHint.slice(0, 200);
  const p = formData.preferences;
  if (p) {
    if (p.dietaryNotes && p.dietaryNotes.length > 200) p.dietaryNotes = p.dietaryNotes.slice(0, 200);
    if (p.mustVisit && p.mustVisit.length > 500) p.mustVisit = p.mustVisit.slice(0, 500);
    if (p.mustAvoid && p.mustAvoid.length > 500) p.mustAvoid = p.mustAvoid.slice(0, 500);
    if (p.specialNeeds && p.specialNeeds.length > 500) p.specialNeeds = p.specialNeeds.slice(0, 500);
  }

  formData.peopleCount = Math.max(1, Math.min(50, Math.floor(Number(formData.peopleCount) || 1)));
  if (!formData.preferences) {
    return NextResponse.json({ error: '请完善偏好设置' }, { status: 400 });
  }
  const modes = formData.preferences.transportModes;
  if (!modes || modes.length === 0) {
    return NextResponse.json({ error: '请至少选择一种出行方式' }, { status: 400 });
  }

  // Usage limit check
  const usageCheck = await checkUsageLimit(request);
  if (!usageCheck.allowed) {
    if (usageCheck.reason === 'blacklisted') {
      return NextResponse.json(
        { error: '你的账户已被限制使用，请联系管理员', code: 'BLACKLISTED' },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: '免费试用已用完，请注册登录后继续使用', code: 'GUEST_LIMIT' },
      { status: 403 },
    );
  }

  const { userId, supabase } = await getOptionalUser();
  if (process.env.NODE_ENV === 'development') {
    console.log('[generate] userId:', userId ?? '(not logged in)', '| mode:', formData.destinationMode, '| destinations:', formData.destinations);
  }

  const isFast = formData.generationMode === 'fast';
  const isRegenerate = !!formData.regenerate;
  const isMountainRun = formData.preferences?.motoRideType === 'mountain_run';
  const hasSelfDriveMode = modes.some((m: string) => ['self_drive', 'motorcycle'].includes(m));
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

  const buildResult = (
    parsed: any,
    hotelWebSearchUsed: boolean,
    transportFoodWebSearchUsed: boolean,
    weatherPayload: any,
    fallbackUsed = false
  ) => {
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
        planDescription: '',
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
      transportFoodWebSearchUsed,
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

  async function maybePersist(result: Record<string, unknown>) {
    if (!userId || !supabase) {
      console.log('[generate] skip persist — no auth, will use local storage');
      return { ...result, saveLocal: true };
    }
    try {
      const saved = await saveGeneratedTrip(
        supabase,
        userId,
        formData,
        result as GeneratedStreamPayload,
      );
      if ('tripId' in saved) {
        console.log('[generate] trip saved, id:', saved.tripId);
        return { ...result, savedTripId: saved.tripId };
      }
      console.warn('[generate] persist returned skipped');
    } catch (e) {
      console.error('[generate] persist error:', e);
    }
    return { ...result, saveLocal: true };
  }

  /** Core generation logic — shared between SSE and async modes */
  async function runGeneration(): Promise<Record<string, unknown>> {
    const emptyWeather = {
      promptText: '',
      payload: { source: 'open-meteo' as const, timezone: 'Asia/Shanghai', locations: [] },
    };

    if (isMountainRun) {
      const weatherRes = await fetchTripWeatherForPlan(formData).catch(() => emptyWeather);
      const { promptText: weatherContext, payload: weatherPayload } = weatherRes || emptyWeather;
      const prompt = buildMultiPlanPrompt(formData, { weatherContext });
      const raw = await callQwen(prompt, {
        maxTokens: 4500, temperature: 0.85, timeoutMs: 60000,
        model: resolveGenerateModel(false), enableSearch: true,
      });
      const built = buildResult(parseJsonResponse(raw), false, false, weatherPayload);
      if (hasSelfDriveMode) await backfillDrivingData(built as Record<string, unknown>);
      return maybePersist(built as Record<string, unknown>);
    }

    const [hotelRes, weatherRes, transportFoodRes, realDataRes, routeRes] = await Promise.allSettled([
      buildHotelWebContextForPrompt(formData),
      fetchTripWeatherForPlan(formData),
      buildTransportFoodWebContextForPrompt(formData),
      collectRealDataForTrip(formData),
      formData.destinationMode === 'specific' && formData.destinations?.length >= 2
        ? optimizeRoute(formData.departure, formData.destinations)
        : Promise.resolve(null),
    ]);

    const hotelWebContext = hotelRes.status === 'fulfilled' ? hotelRes.value.contextText : '';
    const hotelWebSearchUsed = true;
    const transportFoodContext = transportFoodRes.status === 'fulfilled' ? transportFoodRes.value.contextText : '';
    const transportFoodWebSearchUsed = transportFoodRes.status === 'fulfilled' ? transportFoodRes.value.used : false;
    const realDataContext = realDataRes.status === 'fulfilled' ? realDataRes.value.promptText : '';
    const optimizedRoute = routeRes.status === 'fulfilled' ? routeRes.value : null;
    const { promptText: weatherContext, payload: weatherPayload } =
      weatherRes.status === 'fulfilled' ? weatherRes.value : emptyWeather;

    let prompt = buildMultiPlanPrompt(formData, {
      hotelWebContext, weatherContext, transportFoodContext, realDataContext, optimizedRoute: optimizedRoute ?? undefined,
    });
    if (isRegenerate) {
      prompt += '\n\n【重新生成要求】用户对上一次方案不满意，请给出完全不同的方案：换不同的景点组合、不同的游玩路线顺序、不同的餐厅和住宿推荐。不要重复上次的内容。';
    }
    const maxTokens = computeMaxTokens(isFast, lockedDayCount);
    const timeoutMs = computeTimeoutMs(isFast, lockedDayCount);

    try {
      const raw = await callQwen(prompt, {
        maxTokens, temperature: isRegenerate ? 0.85 : (isFast ? 0.2 : 0.35), timeoutMs,
        model: resolveGenerateModel(isFast), enableSearch: true,
      });
      const built = buildResult(parseJsonResponse(raw), hotelWebSearchUsed, transportFoodWebSearchUsed, weatherPayload);
      await backfillWeatherFromResult(built as Record<string, unknown>, formData);
      if (!isFast) await postEnrichTransitData(built as Record<string, unknown>);
      if (hasSelfDriveMode) await backfillDrivingData(built as Record<string, unknown>);
      return maybePersist(built as Record<string, unknown>);
    } catch (err: any) {
      const msg = String(err?.message || '');
      const shouldRetry = msg.includes('超时') || msg.includes('timeout') || msg.includes('Abort');
      if (!shouldRetry) throw err;

      console.error('Qwen first attempt timed out, retrying with turbo…');
      const fbDays = lockedDayCount ?? 7;
      const fbTokens = computeMaxTokens(true, fbDays);
      const fallbackPrompt = `${prompt}\n\n【降级重试要求】\n请只返回1个最可执行方案。若用户为固定日期，itinerary 必须恰好覆盖从出发到返程的每一天（day 连续、每天一条），每天只写2-3条核心活动，不可漏天。`;
      const raw = await callQwen(fallbackPrompt, {
        maxTokens: fbTokens, temperature: 0.2,
        timeoutMs: Math.min(130000, 25000 + fbTokens * 12),
        model: 'qwen-turbo', enableSearch: true,
      });
      const built = buildResult(parseJsonResponse(raw), hotelWebSearchUsed, transportFoodWebSearchUsed, weatherPayload, true);
      await backfillWeatherFromResult(built as Record<string, unknown>, formData);
      if (!isFast) await postEnrichTransitData(built as Record<string, unknown>);
      if (hasSelfDriveMode) await backfillDrivingData(built as Record<string, unknown>);
      return maybePersist(built as Record<string, unknown>);
    }
  }

  // --- Async mode for logged-in users ---
  if (userId) {
    const jobId = await createJob(userId, formData);
    if (jobId) {
      // Record usage immediately
      recordUsage(userId, 'generation', null).catch(() => {});

      // Fire-and-forget: run generation in background
      (async () => {
        try {
          await updateJobStatus(jobId, 'running');
          const result = await runGeneration();
          const tripId = typeof result.savedTripId === 'string' ? result.savedTripId : undefined;
          await updateJobStatus(jobId, 'done', { result, trip_id: tripId });
          console.log('[job]', jobId, 'done, tripId:', tripId);
        } catch (err: any) {
          console.error('[job]', jobId, 'failed:', err.message);
          await updateJobStatus(jobId, 'error', { error_message: err.message || '生成失败' });
        }
      })();

      return NextResponse.json({ jobId, async: true });
    }
    // If job creation failed (e.g. table doesn't exist), fall through to SSE mode
    console.warn('[generate] job creation failed, falling back to SSE');
  }

  // --- SSE mode for guests (or fallback) ---
  const stream = streamWithKeepAlive(() => runGeneration());

  const headerInit = sseHeaders();
  const headers = new Headers(headerInit);

  if (!usageCheck.userId) {
    const newCount = (usageCheck.guestCount ?? 0) + 1;
    setGuestUsageCookie(headers, newCount);
  } else {
    const tokenUsage = getLastQwenUsage();
    recordUsage(usageCheck.userId, 'generation', tokenUsage).catch(() => {});
  }

  return new Response(stream, { headers });
}
