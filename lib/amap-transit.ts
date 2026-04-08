
const isDev = process.env.NODE_ENV === 'development';
const GEOCODE_URL = 'https://restapi.amap.com/v3/geocode/geo';
const TRANSIT_URL = 'https://restapi.amap.com/v5/direction/transit/integrated';

const geocodeCache = new Map<string, GeocodedCity>();

export interface TransitRoute {
  totalDuration: number; // seconds
  totalDistance: number; // meters
  totalCost: number; // yuan
  segments: TransitSegment[];
}

export interface TransitSegment {
  type: 'walking' | 'bus' | 'railway' | 'taxi';
  lineName?: string;
  departureStop?: string;
  arrivalStop?: string;
  duration?: number;
  distance?: number;
  viaStops?: string[];
}

interface GeocodedCity {
  location: string;
  citycode: string;
}

function getKey(): string | undefined {
  return process.env.AMAP_KEY?.trim() || undefined;
}

function parseNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

async function geocodeCity(cityName: string): Promise<GeocodedCity | null> {
  const address = cityName.trim();
  if (!address) return null;

  const cached = geocodeCache.get(address);
  if (cached) return cached;

  const key = getKey();
  if (!key) return null;

  try {
    const params = new URLSearchParams({
      key,
      address,
    });
    const res = await fetch(`${GEOCODE_URL}?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      geocodes?: Array<{
        location?: string;
        citycode?: string;
        adcode?: string;
      }>;
    };
    if (data.status !== '1' || !data.geocodes?.length) return null;

    const g = data.geocodes[0];
    const location = g.location?.trim();
    if (!location) return null;

    const citycode = (g.citycode || '').trim();
    if (!citycode) return null;

    const resolved: GeocodedCity = { location, citycode };

    geocodeCache.set(address, resolved);
    return resolved;
  } catch {
    return null;
  }
}

interface AmapBusLine {
  name?: string;
  type?: string;
  departure_stop?: { name?: string };
  arrival_stop?: { name?: string };
  duration?: string | number;
  distance?: string | number;
  via_stops?: Array<{ name?: string }>;
}

interface AmapSegment {
  railway?: {
    name?: string;
    trip?: string;
    time?: string | number;
    distance?: string | number;
    departure_stop?: { name?: string };
    arrival_stop?: { name?: string };
    via_stops?: Array<{ name?: string }>;
    via_stop?: Array<{ name?: string }>;
  };
  bus?: { buslines?: AmapBusLine[] };
  taxi?: {
    price?: string;
    startname?: string;
    endname?: string;
    drivetime?: string | number;
    distance?: string | number;
  };
  walking?: { duration?: string | number; distance?: string | number };
}

function parseTransitSegments(segments: AmapSegment[] | undefined): TransitSegment[] {
  if (!Array.isArray(segments)) return [];
  const out: TransitSegment[] = [];

  for (const seg of segments) {
    if (seg?.railway?.name) {
      const rw = seg.railway;
      const viaRaw = rw.via_stops ?? rw.via_stop;
      let viaStops: string[] | undefined;
      if (Array.isArray(viaRaw)) {
        viaStops = viaRaw
          .map((x) => x?.name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0);
        if (viaStops.length === 0) viaStops = undefined;
      }
      const trip = rw.trip ? String(rw.trip).trim() : '';
      const lineLabel = trip ? `${rw.name}（${trip}）` : String(rw.name);
      out.push({
        type: 'railway',
        lineName: lineLabel,
        departureStop: rw.departure_stop?.name,
        arrivalStop: rw.arrival_stop?.name,
        duration: parseNum(rw.time),
        distance: parseNum(rw.distance),
        viaStops,
      });
      continue;
    }

    if (seg?.bus?.buslines?.length) {
      const lines = seg.bus.buslines;
      const names = lines.map((b) => b.name).filter(Boolean) as string[];
      const first = lines[0];
      const via = first.via_stops
        ?.map((s) => s.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      out.push({
        type: 'bus',
        lineName: names.length ? names.join(' → ') : first.type,
        departureStop: first.departure_stop?.name,
        arrivalStop: lines[lines.length - 1]?.arrival_stop?.name ?? first.arrival_stop?.name,
        duration: parseNum(first.duration),
        distance: parseNum(first.distance),
        viaStops: via?.length ? via : undefined,
      });
      continue;
    }

    if (seg?.taxi && (seg.taxi.price || seg.taxi.startname || seg.taxi.endname)) {
      const tx = seg.taxi;
      out.push({
        type: 'taxi',
        lineName: tx.price ? `出租车 约¥${tx.price}` : '出租车',
        departureStop: tx.startname,
        arrivalStop: tx.endname,
        duration: parseNum(tx.drivetime),
        distance: parseNum(tx.distance),
      });
      continue;
    }

    if (seg?.walking) {
      const w = seg.walking;
      out.push({
        type: 'walking',
        duration: parseNum(w.duration),
        distance: parseNum(w.distance),
      });
      continue;
    }
  }

  return out;
}

interface AmapTransitItem {
  cost?: { duration?: string | number; transit_fee?: string | number };
  distance?: string | number;
  segments?: AmapSegment[];
}

function mapTransitToRoute(t: AmapTransitItem | null | undefined): TransitRoute | null {
  if (!t) return null;
  const cost = t.cost ?? {};
  const duration = parseNum(cost.duration) ?? 0;
  const totalCost = parseNum(cost.transit_fee) ?? 0;
  const totalDistance = parseNum(t.distance) ?? 0;
  const segments = parseTransitSegments(t.segments);

  return {
    totalDuration: duration,
    totalDistance,
    totalCost,
    segments,
  };
}

/**
 * 查询城市间公共交通方案：先将城市名地理编码为坐标与城市编码，再调用公交路径规划 v5。
 */
export async function getTransitRoutes(
  fromCity: string,
  toCity: string,
  options?: { maxRoutes?: number; strategy?: number },
): Promise<TransitRoute[]> {
  const maxRoutes = Math.min(10, Math.max(1, options?.maxRoutes ?? 3));
  const strategy = options?.strategy ?? 0;

  try {
    const key = getKey();
    if (!key) return [];

    const [from, to] = await Promise.all([geocodeCity(fromCity), geocodeCity(toCity)]);
    if (!from || !to) return [];

    const params = new URLSearchParams({
      key,
      origin: from.location,
      destination: to.location,
      city1: from.citycode,
      city2: to.citycode,
      strategy: String(strategy),
      AlternativeRoute: String(maxRoutes),
      show_fields: 'cost',
    });

    const res = await fetch(`${TRANSIT_URL}?${params.toString()}`);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      status?: string;
      route?: { transits?: AmapTransitItem[] };
    };

    if (data.status !== '1') return [];

    const list = data.route?.transits;
    if (!Array.isArray(list) || list.length === 0) return [];

    const routes: TransitRoute[] = [];
    for (const item of list) {
      const r = mapTransitToRoute(item);
      if (r) routes.push(r);
    }
    return routes;
  } catch {
    return [];
  }
}

function formatDurationCn(totalSec: number): string {
  if (totalSec <= 0) return '约0分钟';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0 && m > 0) return `约${h}小时${m}分钟`;
  if (h > 0) return `约${h}小时`;
  return `约${m}分钟`;
}

function formatYuanCn(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan < 0) return '约¥0';
  if (Number.isInteger(yuan)) return `约¥${yuan}`;
  const s = yuan.toFixed(2).replace(/\.?0+$/, '');
  return `约¥${s}`;
}

function formatMeters(m: number): string {
  if (m >= 1000) return `约${(m / 1000).toFixed(1)}公里`;
  return `约${Math.round(m)}米`;
}

function formatSegmentLine(seg: TransitSegment, index: number): string {
  const n = index + 1;
  const dur =
    seg.duration !== undefined ? formatDurationCn(seg.duration) : '';
  const dist = seg.distance !== undefined ? formatMeters(seg.distance) : '';

  if (seg.type === 'walking') {
    const parts = [`${n}. 步行`];
    if (dur) parts.push(dur);
    if (dist) parts.push(dist);
    return parts.join('，');
  }

  if (seg.type === 'railway') {
    const parts = [`${n}. 铁路`];
    if (seg.lineName) parts.push(seg.lineName);
    if (seg.departureStop && seg.arrivalStop) {
      parts.push(`${seg.departureStop} → ${seg.arrivalStop}`);
    }
    if (seg.viaStops?.length) {
      parts.push(`途经：${seg.viaStops.join('、')}`);
    }
    if (dur) parts.push(`耗时${dur}`);
    if (dist) parts.push(dist);
    return parts.join('，');
  }

  if (seg.type === 'taxi') {
    const parts = [`${n}. 打车`];
    if (seg.departureStop && seg.arrivalStop) {
      parts.push(`${seg.departureStop} → ${seg.arrivalStop}`);
    }
    if (seg.lineName) parts.push(seg.lineName);
    if (dur) parts.push(`耗时${dur}`);
    if (dist) parts.push(dist);
    return parts.join('，');
  }

  const parts = [`${n}. 公交/地铁`];
  if (seg.lineName) parts.push(seg.lineName);
  if (seg.departureStop && seg.arrivalStop) {
    parts.push(`${seg.departureStop} → ${seg.arrivalStop}`);
  }
  if (seg.viaStops?.length) {
    parts.push(`途经：${seg.viaStops.join('、')}`);
  }
  if (dur) parts.push(`耗时${dur}`);
  if (dist) parts.push(dist);
  return parts.join('，');
}

/**
 * 将一条公共交通方案格式化为可读的中文摘要。
 */
export function formatTransitSummary(route: TransitRoute): string {
  const head: string[] = [];
  head.push(`全程${formatDurationCn(route.totalDuration)}`);
  head.push(formatYuanCn(route.totalCost));
  if (route.totalDistance > 0) {
    head.push(`总距离${formatMeters(route.totalDistance)}`);
  }

  const lines = [head.join('，')];
  if (route.segments.length > 0) {
    lines.push('');
    lines.push(...route.segments.map((s, i) => formatSegmentLine(s, i)));
  }
  return lines.join('\n');
}
