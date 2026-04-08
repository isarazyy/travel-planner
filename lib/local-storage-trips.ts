/**
 * 本地存储行程 — Supabase 不可用时的兜底方案。
 * 数据存在浏览器 localStorage，换设备 / 清缓存会丢失。
 */

const STORAGE_KEY = 'travel_planner_trips';

export interface LocalTrip {
  id: string;
  departure: string;
  destination: string;
  destinations: string[];
  date_mode: string;
  start_date: string;
  end_date: string;
  people_count: number;
  preferences?: unknown;
  created_at: string;
  trip_plans: LocalTripPlan[];
}

export interface LocalTripPlan {
  id: string;
  trip_id: string;
  mode: string;
  planName?: string;
  transport_detail: string;
  itinerary: unknown[];
  attractions: unknown[];
  accommodations: unknown[];
  food_spots: unknown[];
  cost_breakdown: Record<string, unknown>;
  estimated_total: number;
  tips: unknown[];
}

function uid(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getAllLocalTrips(): LocalTrip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function safeSetStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    try {
      const all = getAllLocalTrips();
      if (all.length > 5) {
        all.length = Math.floor(all.length / 2);
        localStorage.setItem(key, JSON.stringify(all));
        localStorage.setItem(key, value);
        return true;
      }
    } catch { /* storage truly full */ }
    return false;
  }
}

export function saveLocalTrip(trip: Omit<LocalTrip, 'id' | 'created_at'>): string {
  const all = getAllLocalTrips();
  const id = uid();
  const entry: LocalTrip = {
    ...trip,
    id,
    created_at: new Date().toISOString(),
  };
  all.unshift(entry);
  if (all.length > 50) all.length = 50;
  safeSetStorage(STORAGE_KEY, JSON.stringify(all));
  return id;
}

export function deleteLocalTrip(id: string): void {
  const all = getAllLocalTrips().filter((t) => t.id !== id);
  safeSetStorage(STORAGE_KEY, JSON.stringify(all));
}

export function getLocalTripById(id: string): LocalTrip | null {
  return getAllLocalTrips().find((t) => t.id === id) ?? null;
}

/**
 * 把 generate 返回的 result 转成 LocalTrip 格式并存入 localStorage。
 * 返回生成的 trip id。
 */
export function saveGenerateResultLocally(result: Record<string, unknown>): string {
  const trip = (result.trip ?? {}) as Record<string, unknown>;
  const plans = (result.plans ?? []) as Record<string, unknown>[];
  const tripId = uid();

  const localPlans: LocalTripPlan[] = plans.map((p, i) => ({
    id: `${tripId}_plan_${i}`,
    trip_id: tripId,
    mode: (p.mode as string) || 'train',
    planName: (p.planName as string) || undefined,
    transport_detail: (p.transport_detail as string) || '',
    itinerary: (p.itinerary as unknown[]) || [],
    attractions: (p.attractions as unknown[]) || [],
    accommodations: (p.accommodations as unknown[]) || [],
    food_spots: (p.food_spots as unknown[]) || [],
    cost_breakdown: (p.cost_breakdown as Record<string, unknown>) || {},
    estimated_total: Number(p.estimated_total) || 0,
    tips: (p.tips as unknown[]) || [],
  }));

  const entry: LocalTrip = {
    id: tripId,
    departure: (trip.departure as string) || '',
    destination: Array.isArray(trip.destinations)
      ? (trip.destinations as string[]).join('、')
      : String(trip.destinations || ''),
    destinations: Array.isArray(trip.destinations)
      ? (trip.destinations as string[])
      : [],
    date_mode: (trip.date_mode as string) || 'flexible',
    start_date: (trip.start_date as string) || '',
    end_date: (trip.end_date as string) || '',
    people_count: Number(trip.people_count) || 1,
    preferences: trip.preferences,
    created_at: new Date().toISOString(),
    trip_plans: localPlans,
  };

  const all = getAllLocalTrips();
  all.unshift(entry);
  if (all.length > 50) all.length = 50;
  safeSetStorage(STORAGE_KEY, JSON.stringify(all));
  return tripId;
}
