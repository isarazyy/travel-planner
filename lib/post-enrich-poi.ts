/**
 * AI 生成方案后，把行程中的景点 / 餐厅 / 酒店与高德真实 POI 匹配，
 * 回填实景图片、评分、营业时间、地址、坐标等"做实"字段。
 *
 * 优先用生成阶段已采集的 POI（collectRealDataForTrip），
 * 命中不了的少量地点再做有限次高德精确补查（控制并发与总量，避免拖慢）。
 */
import type { CollectedRealData } from './amap-data-collector';
import { searchPlaceByName, type AmapPOI } from './amap-poi';
import type { PlaceInfo, TripFormData } from './types';

const isDev = process.env.NODE_ENV === 'development';

/** 单次生成最多额外补查的地点数（控制延迟与配额） */
const MAX_TARGETED_LOOKUPS = 16;
/** 补查并发上限（高德个人 key 有 QPS 限制，保守一点） */
const LOOKUP_CONCURRENCY = 3;

interface Activity {
  time?: string;
  activity?: string;
  location?: string;
  notes?: string;
  transportInfo?: unknown;
  placeInfo?: PlaceInfo;
  foodRecommendation?: { shopName?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

interface DayPlan {
  activities?: Activity[];
  [key: string]: unknown;
}

interface Attraction {
  name?: string;
  image?: string;
  rating?: number;
  openTime?: string;
  address?: string;
  location?: string;
  [key: string]: unknown;
}

interface PlanData {
  itinerary?: DayPlan[];
  attractions?: Attraction[];
  [key: string]: unknown;
}

const TRANSPORT_RE = /高铁|动车|火车|列车|铁路|航班|飞机|飞往|乘车|坐车|大巴|客运|包车|打车|地铁|公交|前往.{0,4}站|返程|抵达/;

function norm(s: string | undefined): string {
  return (s || '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[（）()【】[\]·、，,。.!！?？:：'"`]/g, '')
    .toLowerCase();
}

/** 从一段文本里挑出最像"地点名"的片段（去掉动词前缀如 游览/打卡/参观） */
function extractPlaceName(location: string | undefined, activity: string | undefined): string {
  const loc = (location || '').trim();
  // location 是跨城交通段（A→B）时不当作地点
  if (loc && /[→➡>﹥➔]/.test(loc)) return '';
  if (loc && loc.length >= 2) return loc;
  const act = (activity || '').trim();
  if (!act) return '';
  return act.replace(/^(游览|参观|打卡|游玩|前往|探访|逛|漫步|游|登)/, '').trim();
}

function buildIndex(data: CollectedRealData): Map<string, AmapPOI> {
  const idx = new Map<string, AmapPOI>();
  const add = (poi: AmapPOI | undefined) => {
    const k = norm(poi?.name);
    if (!poi || !k) return;
    const ex = idx.get(k);
    if (!ex || (!ex.photo && poi.photo)) idx.set(k, poi);
  };
  for (const city of Object.keys(data.attractions || {})) (data.attractions[city] || []).forEach(add);
  for (const city of Object.keys(data.restaurants || {})) (data.restaurants[city] || []).forEach(add);
  for (const city of Object.keys(data.hotels || {})) (data.hotels[city] || []).forEach(add);
  return idx;
}

function lookup(idx: Map<string, AmapPOI>, rawName: string): AmapPOI | null {
  const t = norm(rawName);
  if (t.length < 2) return null;
  const exact = idx.get(t);
  if (exact) return exact;
  let best: AmapPOI | null = null;
  for (const [k, poi] of idx) {
    if (k.length < 2) continue;
    if (t.includes(k) || k.includes(t)) {
      if (!best || (poi.photo && !best.photo)) best = poi;
    }
  }
  return best;
}

function toPlaceInfo(poi: AmapPOI): PlaceInfo | null {
  const info: PlaceInfo = {};
  if (poi.photo) info.photo = poi.photo;
  const r = parseFloat(poi.rating);
  if (Number.isFinite(r) && r > 0) info.rating = r;
  if (poi.openTime && poi.openTime !== '[]') info.openTime = poi.openTime.slice(0, 60);
  const c = parseFloat(poi.cost);
  if (Number.isFinite(c) && c > 0) info.cost = Math.round(c);
  if (poi.address) info.address = poi.address;
  if (poi.tel && poi.tel !== '[]') info.tel = poi.tel;
  if (poi.location) info.location = poi.location;
  // 没有任何有用信息就不挂
  if (!info.photo && info.rating == null && !info.openTime) return null;
  return info;
}

function mergePlaceInfo(existing: PlaceInfo | undefined, next: PlaceInfo): PlaceInfo {
  return {
    photo: existing?.photo || next.photo,
    rating: existing?.rating ?? next.rating,
    openTime: existing?.openTime || next.openTime,
    cost: existing?.cost ?? next.cost,
    address: existing?.address || next.address,
    tel: existing?.tel || next.tel,
    location: existing?.location || next.location,
  };
}

function destinationCities(data: CollectedRealData, formData: TripFormData): string[] {
  const set = new Set<string>();
  for (const city of Object.keys(data.attractions || {})) set.add(city);
  for (const city of Object.keys(data.restaurants || {})) set.add(city);
  for (const d of formData.destinations || []) {
    for (const part of d.split(/[、,，]/)) {
      const t = part.trim();
      if (t) set.add(t);
    }
  }
  return [...set];
}

/** 带并发上限的批量补查 */
async function runLookups(
  names: string[],
  cities: string[],
): Promise<Map<string, AmapPOI>> {
  const result = new Map<string, AmapPOI>();
  const queue = names.slice(0, MAX_TARGETED_LOOKUPS);
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const name = queue[cursor++];
      for (const city of cities) {
        try {
          const poi = await searchPlaceByName(name, city);
          if (poi && (poi.photo || poi.rating)) {
            result.set(norm(name), poi);
            break;
          }
        } catch {
          /* 单点失败忽略 */
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, queue.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

async function enrichPlan(
  plan: PlanData,
  idx: Map<string, AmapPOI>,
  cities: string[],
  allowTargetedLookup: boolean,
): Promise<number> {
  const itinerary = Array.isArray(plan.itinerary) ? plan.itinerary : [];
  const attractions = Array.isArray(plan.attractions) ? plan.attractions : [];

  // 1) 先收集所有需要图片但本地索引命中不了的地点名
  const unmatched = new Set<string>();
  const candidateNames: { name: string }[] = [];

  for (const att of attractions) {
    const name = (att.name || '').trim();
    if (name && !att.image) {
      candidateNames.push({ name });
      if (!lookup(idx, name)) unmatched.add(name);
    }
  }
  for (const day of itinerary) {
    for (const act of day.activities || []) {
      if (act.transportInfo && (act.transportInfo as Record<string, unknown>).fromStation) continue;
      const text = `${act.activity || ''} ${act.notes || ''} ${act.location || ''}`;
      if (TRANSPORT_RE.test(text) && !extractPlaceName(act.location, act.activity)) continue;
      const place = extractPlaceName(act.location, act.activity);
      if (place && !lookup(idx, place)) unmatched.add(place);
    }
  }

  // 2) 有限次精确补查，结果并入索引（快速模式跳过以保速度）
  if (allowTargetedLookup && unmatched.size > 0) {
    const fetched = await runLookups([...unmatched], cities);
    for (const [k, poi] of fetched) idx.set(k, poi);
    isDev && console.log(`[poi-enrich] 补查 ${unmatched.size} 个地点，命中 ${fetched.size} 个`);
  }

  let enriched = 0;

  // 3) 回填亮点景点清单
  for (const att of attractions) {
    const poi = lookup(idx, att.name || '');
    if (!poi) continue;
    if (!att.image && poi.photo) att.image = poi.photo;
    const r = parseFloat(poi.rating);
    if (att.rating == null && Number.isFinite(r) && r > 0) att.rating = r;
    if (!att.openTime && poi.openTime && poi.openTime !== '[]') att.openTime = poi.openTime.slice(0, 60);
    if (!att.address && poi.address) att.address = poi.address;
    if (!att.location && poi.location) att.location = poi.location;
    if (poi.photo) enriched++;
  }

  // 4) 回填每日行程活动
  for (const day of itinerary) {
    for (const act of day.activities || []) {
      const place = extractPlaceName(act.location, act.activity);
      if (!place) continue;
      const poi = lookup(idx, place);
      if (!poi) continue;
      const info = toPlaceInfo(poi);
      if (!info) continue;
      act.placeInfo = mergePlaceInfo(act.placeInfo, info);
      if (info.photo) enriched++;
    }
  }

  return enriched;
}

/**
 * 主入口：用高德真实 POI 回填生成结果中的景点图片/评分/营业时间等。
 * 同时兼容单方案与多方案（plans 数组）结构。
 */
export async function postEnrichPoiData(
  result: Record<string, unknown>,
  realData: CollectedRealData | null,
  formData: TripFormData,
  allowTargetedLookup = true,
): Promise<void> {
  if (!realData) return;
  const start = Date.now();

  const plans: PlanData[] = [];
  if (Array.isArray(result.plans)) {
    for (const p of result.plans) if (p && typeof p === 'object') plans.push(p as PlanData);
  } else if (Array.isArray(result.itinerary)) {
    plans.push(result as unknown as PlanData);
  }
  if (plans.length === 0) return;

  const idx = buildIndex(realData);
  const cities = destinationCities(realData, formData);

  let total = 0;
  for (const plan of plans) {
    total += await enrichPlan(plan, idx, cities, allowTargetedLookup);
  }

  isDev && console.log(`[poi-enrich] 完成，回填 ${total} 处真实图片/数据，耗时 ${Date.now() - start}ms`);
}
