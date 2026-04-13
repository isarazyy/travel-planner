import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarTripDays } from '@/lib/prompts';
import type { TripFormData } from '@/lib/types';

/** 生成结果中与 buildResult 一致的 payload 形状（节选） */
export type GeneratedStreamPayload = {
  trip: {
    departure: string;
    destinations: string[];
    date_mode: string;
    start_date: string;
    end_date: string;
    people_count: number;
    preferences?: unknown;
  };
  recommendations?: { days?: number | null };
  plans: Array<{
    planName?: string;
    transport_detail: string;
    itinerary: unknown[];
    attractions: unknown[];
    accommodations: unknown[];
    food_spots: unknown[];
    cost_breakdown: Record<string, unknown>;
    estimated_total: number | string;
    tips: unknown[];
  }>;
};

function addDaysIso(startIso: string, add: number): string {
  const d = new Date(startIso + 'T12:00:00');
  if (!Number.isFinite(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function firstItineraryDateIso(plans: GeneratedStreamPayload['plans']): string | null {
  for (const p of plans) {
    const it = p.itinerary;
    if (!Array.isArray(it) || it.length === 0) continue;
    const day0 = it[0] as { dateIso?: string };
    if (typeof day0?.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day0.dateIso)) {
      return day0.dateIso;
    }
  }
  return null;
}

export function resolveTripDateRange(
  formData: TripFormData,
  payload: GeneratedStreamPayload,
): { start: string; end: string } {
  if (formData.dateMode === 'fixed' && formData.startDate && formData.endDate) {
    return { start: formData.startDate, end: formData.endDate };
  }

  const fromForm = formData.startDate?.trim();
  const fromTrip = payload.trip?.start_date?.trim();
  const fromItin = firstItineraryDateIso(payload.plans);
  const start = fromForm || fromTrip || fromItin || new Date().toISOString().slice(0, 10);

  let daySpan = 1;
  if (formData.dateMode === 'fixed' && formData.startDate && formData.endDate) {
    daySpan = calendarTripDays(formData.startDate, formData.endDate);
  } else {
    const recDays = payload.recommendations?.days;
    const lens = (payload.plans || []).map((p) =>
      Array.isArray(p.itinerary) ? p.itinerary.length : 0,
    );
    const itLen = lens.length ? Math.max(0, ...lens) : 0;
    const n = typeof recDays === 'number' && recDays > 0 ? recDays : itLen > 0 ? itLen : 3;
    daySpan = Math.max(1, Math.min(60, n));
  }

  const end = addDaysIso(start, daySpan - 1);
  return { start, end };
}

function assignPlanModes(planCount: number, transportModes: string[]): string[] {
  const valid = ['budget', 'self_drive', 'train', 'flight', 'motorcycle'] as const;
  const pool = [
    ...new Set([
      ...transportModes.filter((m): m is (typeof valid)[number] =>
        (valid as readonly string[]).includes(m),
      ),
      ...valid,
    ]),
  ];
  const out: string[] = [];
  for (let i = 0; i < planCount; i++) {
    if (i < pool.length) {
      out.push(pool[i]);
    } else {
      out.push(`plan_${i}`);
    }
  }
  return out;
}

function destinationSummary(formData: TripFormData): string {
  if (formData.destinations?.length) return formData.destinations.join('、');
  if (formData.destinationHint?.trim()) return formData.destinationHint.trim();
  return '行程规划';
}

function destinationsArray(formData: TripFormData): string[] {
  if (formData.destinations?.length) return [...formData.destinations];
  const s = destinationSummary(formData);
  return s ? [s] : ['待定目的地'];
}

/**
 * 将生成结果写入 trips / trip_plans；失败时只打日志，不抛错（用户仍能看到当次结果）。
 */
export async function saveGeneratedTrip(
  supabase: SupabaseClient,
  userId: string,
  formData: TripFormData,
  payload: GeneratedStreamPayload,
): Promise<{ tripId: string } | { skipped: true }> {
  if (!payload.plans?.length) return { skipped: true };

  const { start, end } = resolveTripDateRange(formData, payload);
  const destSummary = destinationSummary(formData);
  const destArr = destinationsArray(formData);

  const { data: tripRow, error: tripErr } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      departure: formData.departure,
      destination: destSummary,
      destinations: destArr,
      date_mode: formData.dateMode,
      start_date: start,
      end_date: end,
      people_count: formData.peopleCount,
      preferences: formData.preferences as object,
    })
    .select('id')
    .single();

  if (tripErr || !tripRow?.id) {
    console.error('[save-trip] insert trips failed:', tripErr?.message || tripErr);
    return { skipped: true };
  }

  const modes = assignPlanModes(payload.plans.length, formData.preferences.transportModes);
  const planRows = payload.plans.map((p, i) => ({
    trip_id: tripRow.id,
    mode: modes[i] || 'train',
    transport_detail: p.transport_detail || '',
    itinerary: p.itinerary ?? [],
    attractions: p.attractions ?? [],
    accommodations: p.accommodations ?? [],
    food_spots: p.food_spots ?? [],
    cost_breakdown: p.cost_breakdown ?? {},
    estimated_total: typeof p.estimated_total === 'string' && /\d+-\d+/.test(p.estimated_total) ? p.estimated_total : Math.round(Number(p.estimated_total) || 0),
    tips: Array.isArray(p.tips) ? p.tips : [],
  }));

  const { error: plansErr } = await supabase.from('trip_plans').insert(planRows);
  if (plansErr) {
    console.error('[save-trip] insert trip_plans failed:', plansErr.message);
    await supabase.from('trips').delete().eq('id', tripRow.id);
    return { skipped: true };
  }

  return { tripId: tripRow.id };
}
