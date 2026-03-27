import { NextRequest, NextResponse } from 'next/server';
import { callQwen, parseJsonResponse } from '@/lib/qwen';
import { buildPlanEditPrompt } from '@/lib/prompts';
import {
  ensureAttractions,
  ensureItineraryMatchesDates,
  normalizeItinerary,
  normalizeTips,
} from '@/lib/normalize-plan';
import { sanitizeTransportPlan } from '@/lib/transport-sanity';
import { streamWithKeepAlive, sseHeaders } from '@/lib/stream-response';

function isTimeoutLike(msg: string): boolean {
  return /(超时|timeout|Abort|ETIMEDOUT|aborted)/i.test(msg);
}

function calcEditMaxTokens(dayCount: number): number {
  const raw = 1400 + dayCount * 220;
  return Math.min(8192, Math.max(2800, raw));
}

function calcEditTimeoutMs(dayCount: number): number {
  return Math.min(140000, 60000 + dayCount * 3000);
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { trip, recommendations, activePlan, message, history } = body || {};
  if (!trip || !activePlan || !message) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  const stream = streamWithKeepAlive(async () => {
    const prompt = buildPlanEditPrompt({
      trip,
      recommendations,
      currentPlan: activePlan,
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
        maxTokens: calcEditMaxTokens(dayCount),
        temperature: 0.3,
        timeoutMs: calcEditTimeoutMs(dayCount),
      });
      parsed = parseJsonResponse(raw);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || e || '');
      if (!isTimeoutLike(msg)) throw e;

      const fallbackPrompt = `${prompt}\n\n【超时降级重试】\n请只做与用户本次要求直接相关的最小改动：\n- 文案精简，避免长篇解释\n- itinerary 每天最多保留 2 条核心活动\n- 固定日期时仍必须保留全部天数（不可漏天）\n- 严格返回 JSON，不要任何额外文字`;
      const rawRetry = await callQwen(fallbackPrompt, {
        model: 'qwen-turbo',
        maxTokens: Math.min(7000, calcEditMaxTokens(dayCount)),
        temperature: 0.2,
        timeoutMs: Math.min(130000, calcEditTimeoutMs(dayCount) + 20000),
      });
      parsed = parseJsonResponse(rawRetry);
      fallbackUsed = true;
    }

    const updatedPlan = parsed.updatedPlan || {};
    const aiCost = updatedPlan.costBreakdown || {};
    const aiTotal = Number(aiCost.total || 0);
    const useAiCost = Number.isFinite(aiTotal) && aiTotal > 0;
    let itineraryNorm = normalizeItinerary(updatedPlan.itinerary || activePlan.itinerary || []);
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

    return {
      assistantMessage: parsed.assistantMessage || '已根据你的要求调整方案。',
      changeSummary: parsed.changeSummary || '已完成方案更新。',
      fallbackUsed,
      updatedPlan: {
        planName: updatedPlan.planName || activePlan.planName,
        planDescription: updatedPlan.planDescription || activePlan.planDescription || '',
        transport_detail: transportFixed.transport_detail,
        itinerary: itineraryNorm,
        attractions: ensureAttractions(updatedPlan.attractions || activePlan.attractions || [], itineraryNorm),
        accommodations: updatedPlan.accommodations || activePlan.accommodations || [],
        food_spots: updatedPlan.foodSpots || activePlan.food_spots || [],
        cost_breakdown: useAiCost ? aiCost : (activePlan.cost_breakdown || {}),
        estimated_total: useAiCost ? aiTotal : (activePlan.estimated_total || 0),
        tips: normalizeTips(updatedPlan.tips || activePlan.tips || []),
      },
    };
  });

  return new Response(stream, { headers: sseHeaders() });
}
