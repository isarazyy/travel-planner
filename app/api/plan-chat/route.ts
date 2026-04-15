import { NextRequest, NextResponse } from 'next/server';
import { callQwen, parseJsonResponse } from '@/lib/qwen';
import { resolvePlanChatModel } from '@/lib/qwen-models';
import { buildPlanEditPrompt } from '@/lib/prompts';
import {
  ensureAttractions,
  ensureItineraryMatchesDates,
  normalizeItinerary,
  normalizeTips,
} from '@/lib/normalize-plan';
import { sanitizeTransportPlan } from '@/lib/transport-sanity';
import { streamWithKeepAlive, sseHeaders } from '@/lib/stream-response';
import { checkUsageLimit, setGuestUsageCookie, recordUsage } from '@/lib/usage-limit';
import { getLastQwenUsage } from '@/lib/qwen';

function isTimeoutLike(msg: string): boolean {
  return /(超时|timeout|Abort|ETIMEDOUT|aborted)/i.test(msg);
}

function toNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d+)-(\d+)$/);
    if (m) return (Number(m[1]) + Number(m[2])) / 2;
    const n = Number(v.replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function isRangeStr(v: any): v is string {
  return typeof v === 'string' && /^\d+-\d+$/.test(v.trim());
}

function numToRange(n: number): string {
  if (n <= 0) return '0';
  const lo = Math.round(n * 0.85 / 50) * 50;
  const hi = Math.round(n * 1.15 / 50) * 50;
  return `${Math.max(0, lo)}-${hi}`;
}

function normalizeCostToRange(cb: Record<string, any>): Record<string, any> {
  const keys = ['transport', 'accommodation', 'food', 'attractions', 'other', 'total'];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = cb[k];
    if (isRangeStr(v)) { out[k] = v.trim(); continue; }
    const n = toNum(v);
    out[k] = numToRange(n);
  }
  return out;
}

/**
 * Plan-chat uses delta output (_keep for unchanged days), so token needs
 * are lower than generate. But worst-case the AI rewrites everything.
 * Budget: base covers overhead + changed days; long trips need less per-day
 * because most days will be _keep.
 */
function calcEditMaxTokens(dayCount: number): number {
  const perDay = dayCount > 10 ? 350 : 420;
  const raw = 2500 + dayCount * perDay;
  return Math.min(12000, Math.max(4000, raw));
}

function calcEditTimeoutMs(dayCount: number): number {
  const tokens = calcEditMaxTokens(dayCount);
  return Math.min(150000, 25000 + tokens * 12);
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { trip, recommendations, activePlan, message: rawMessage, history } = body || {};
  if (!trip || !activePlan || !rawMessage) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }
  const message = typeof rawMessage === 'string' && rawMessage.length > 500
    ? rawMessage.slice(0, 500)
    : rawMessage;

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

  // Guest users cannot use AI chat - must register
  if (!usageCheck.userId) {
    return NextResponse.json(
      { error: '注册登录后即可使用 AI 对话修改功能', code: 'GUEST_CHAT_LIMIT' },
      { status: 403 },
    );
  }
  if (process.env.NODE_ENV === 'development') {
    const themes = (activePlan.itinerary || []).slice(0, 3).map((d: any) => `D${d.day}:${d.theme}`);
    console.log('[plan-chat] 收到前端activePlan D1-D3:', themes.join(' | '), '| planName:', activePlan.planName);
  }

  const stream = streamWithKeepAlive(async () => {
    // Compress plan for prompt: strip webNote/pros/cons to reduce input tokens
    const compactPlan = JSON.parse(JSON.stringify(activePlan));
    if (Array.isArray(compactPlan.accommodations)) {
      compactPlan.accommodations = compactPlan.accommodations.map((a: any) => ({
        name: a.name, pricePerNight: a.pricePerNight, area: a.area,
      }));
    }
    if (Array.isArray(compactPlan.itinerary)) {
      for (const day of compactPlan.itinerary) {
        if (Array.isArray(day.activities)) {
          for (const act of day.activities) {
            delete act.foodRecommendation;
          }
        }
      }
    }

    const prompt = buildPlanEditPrompt({
      trip,
      recommendations,
      currentPlan: compactPlan,
      userInstruction: String(message),
      history: Array.isArray(history) ? history : [],
    });

    const dayCount =
      trip?.date_mode === 'fixed' && trip?.start_date && trip?.end_date
        ? Math.max(1, Number(recommendations?.days || activePlan?.itinerary?.length || 7))
        : Math.max(1, Number(activePlan?.itinerary?.length || 7));

    let parsed: any;
    let fallbackUsed = false;
    try {
      const raw = await callQwen(prompt, {
        model: resolvePlanChatModel(),
        maxTokens: calcEditMaxTokens(dayCount),
        temperature: 0.3,
        timeoutMs: calcEditTimeoutMs(dayCount),
        enableSearch: true,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[plan-chat] AI原始返回(前500字):', raw.slice(0, 500));
      }
      parsed = parseJsonResponse(raw);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || e || '');
      if (process.env.NODE_ENV === 'development') {
        console.error('[plan-chat] 首次失败:', msg);
      }
      const isRetryable = isTimeoutLike(msg) || /JSON|position \d+|Unexpected token|Expected|数据格式/.test(msg);
      if (!isRetryable) throw e;

      const fbTokens = Math.min(12000, calcEditMaxTokens(dayCount) + 1500);
      const fallbackPrompt = `${prompt}\n\n【降级重试要求】\n请严格只返回合法 JSON，不要任何额外文字。未改的天用 {"day":N,"_keep":true}，改动的天每天最多2-3条活动，描述从简。`;
      if (process.env.NODE_ENV === 'development') {
        console.log('[plan-chat] 重试中, fbTokens:', fbTokens);
      }
      const rawRetry = await callQwen(fallbackPrompt, {
        model: 'qwen-turbo',
        maxTokens: fbTokens,
        temperature: 0.2,
        timeoutMs: Math.min(150000, 25000 + fbTokens * 12),
        enableSearch: true,
      });
      parsed = parseJsonResponse(rawRetry);
      fallbackUsed = true;
    }

    const planModified = parsed.planModified !== false && parsed.updatedPlan != null;

    if (process.env.NODE_ENV === 'development') {
      console.log('[plan-chat] planModified:', planModified);
    }
    if (!planModified) {
      return {
        planModified: false,
        assistantMessage: parsed.assistantMessage || '有什么想聊的尽管说～',
        changeSummary: null,
        fallbackUsed,
        updatedPlan: null,
      };
    }

    const updatedPlan = parsed.updatedPlan || {};

    // Merge delta itinerary: AI returns _keep:true for unchanged days
    const aiItinerary: any[] = Array.isArray(updatedPlan.itinerary) ? updatedPlan.itinerary : [];
    const origItinerary: any[] = Array.isArray(activePlan.itinerary) ? activePlan.itinerary : [];

    const keptDays = aiItinerary.filter((d: any) => d?._keep === true);
    const fullDays = aiItinerary.filter((d: any) => !d?._keep && d?.activities?.length > 0);
    const isFullRewrite = keptDays.length === 0 && fullDays.length >= 1;
    const isDayCountReduced = fullDays.length > 0 && (fullDays.length + keptDays.length) < origItinerary.length;

    let mergedItinerary: any[];
    if (isFullRewrite) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[plan-chat] 检测到全量重写，直接使用AI返回的itinerary');
      }
      mergedItinerary = aiItinerary;
    } else if (isDayCountReduced) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[plan-chat] 检测到天数减少（原${origItinerary.length}→AI${fullDays.length + keptDays.length}），拼合后截断`);
      }
      mergedItinerary = [];
      for (const aiDay of aiItinerary) {
        if (aiDay?._keep === true) {
          const origDay = origItinerary.find((d: any) => d?.day === aiDay.day);
          if (origDay) mergedItinerary.push(origDay);
        } else if (aiDay?.activities?.length > 0) {
          mergedItinerary.push(aiDay);
        }
      }
      mergedItinerary = mergedItinerary.map((d: any, idx: number) => ({
        ...d,
        day: idx + 1,
      }));
    } else {
      mergedItinerary = origItinerary.map((origDay: any, idx: number) => {
        const aiDay = aiItinerary.find((d: any) => d?.day === origDay?.day) 
          || aiItinerary[idx];
        if (!aiDay || aiDay._keep === true) return origDay;
        if (!aiDay.activities || (Array.isArray(aiDay.activities) && aiDay.activities.length === 0)) return origDay;
        return aiDay;
      });
      for (const aiDay of aiItinerary) {
        if (aiDay?._keep) continue;
        const exists = mergedItinerary.some((d: any) => d?.day === aiDay?.day);
        if (!exists && aiDay?.day) mergedItinerary.push(aiDay);
      }
    }

    const aiCost = updatedPlan.costBreakdown || {};
    const aiTotal = Number(aiCost.total || 0);
    const useAiCost = Number.isFinite(aiTotal) && aiTotal > 0;
    if (process.env.NODE_ENV === 'development') {
      const keptCount = aiItinerary.filter((d: any) => d?._keep).length;
      const changedCount = aiItinerary.length - keptCount;
      console.log(`[plan-chat] itinerary合并: AI返回${aiItinerary.length}天(${changedCount}天改动, ${keptCount}天保留), 原方案${origItinerary.length}天`);
      console.log('[plan-chat] aiCost:', JSON.stringify(aiCost), 'useAiCost:', useAiCost);
      console.log('[plan-chat] 合并后每天主题:', mergedItinerary.map((d: any) => `D${d.day}:${d.theme}`).join(' | '));
    }
    let itineraryNorm = normalizeItinerary(mergedItinerary);
    if (
      trip.date_mode === 'fixed' &&
      typeof trip.start_date === 'string' &&
      typeof trip.end_date === 'string' &&
      trip.start_date &&
      trip.end_date
    ) {
      itineraryNorm = ensureItineraryMatchesDates(itineraryNorm, trip.start_date, trip.end_date);
    }
    const transportFixed = sanitizeTransportPlan({
      transport_detail: updatedPlan.transportDetail || activePlan.transport_detail || '',
      itinerary: itineraryNorm,
    });
    itineraryNorm = transportFixed.itinerary;

    if (process.env.NODE_ENV === 'development') {
      console.log('[plan-chat] 最终itinerary每天主题:', itineraryNorm.map((d: any) => `D${d.day}:${d.theme}`).join(' | '));
    }
    return {
      planModified: true,
      assistantMessage: parsed.assistantMessage || '已根据你的要求调整方案。',
      changeSummary: parsed.changeSummary || '已完成方案更新。',
      fallbackUsed,
      updatedPlan: {
        planName: updatedPlan.planName || activePlan.planName,
        planDescription: '',
        transport_detail: transportFixed.transport_detail,
        itinerary: itineraryNorm,
        attractions: ensureAttractions(updatedPlan.attractions || activePlan.attractions || [], itineraryNorm),
        accommodations: updatedPlan.accommodations || activePlan.accommodations || [],
        food_spots: updatedPlan.foodSpots || activePlan.food_spots || [],
        cost_breakdown: normalizeCostToRange(useAiCost ? aiCost : (activePlan.cost_breakdown || {})),
        estimated_total: (() => {
          const raw = useAiCost ? aiCost : (activePlan.cost_breakdown || {});
          const normalized = normalizeCostToRange(raw);
          return normalized.total || '0';
        })(),
        tips: normalizeTips(updatedPlan.tips || activePlan.tips || []),
      },
    };
  });

  const headerInit = sseHeaders();
  const headers = new Headers(headerInit);

  if (usageCheck.userId) {
    const tokenUsage = getLastQwenUsage();
    recordUsage(usageCheck.userId, 'chat', tokenUsage).catch(() => {});
  }

  return new Response(stream, { headers });
}
