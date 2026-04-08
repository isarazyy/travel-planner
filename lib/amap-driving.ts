/**
 * 高德 Web 服务 — 驾车路径规划 v3
 * 支持多途经点、多策略备选路线，返回解码后的完整路线坐标。
 */

const DRIVING_URL = 'https://restapi.amap.com/v3/direction/driving';
const GEOCODE_URL = 'https://restapi.amap.com/v3/geocode/geo';

const geocodeCache = new Map<string, string>();

function getKey(): string | undefined {
  return (process.env.AMAP_KEY || process.env.NEXT_PUBLIC_AMAP_KEY)?.trim() || undefined;
}

export interface DrivingRoute {
  distance: number;       // meters
  duration: number;       // seconds
  tolls: number;          // yuan
  tollDistance: number;    // meters
  strategy: string;       // display name
  polyline: [number, number][]; // [[lng, lat], ...]
}

export interface DrivingResult {
  strategyLabel: string;
  routes: DrivingRoute[];
}

async function geocodePlace(place: string): Promise<string | null> {
  const trimmed = place.trim();
  if (!trimmed) return null;
  const cached = geocodeCache.get(trimmed);
  if (cached) return cached;

  const key = getKey();
  if (!key) return null;

  try {
    const params = new URLSearchParams({ key, address: trimmed });
    const res = await fetch(`${GEOCODE_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== '1' || !data.geocodes?.length) return null;
    const loc = data.geocodes[0].location?.trim();
    if (!loc) return null;
    geocodeCache.set(trimmed, loc);
    return loc;
  } catch {
    return null;
  }
}

function parsePolylineString(polyStr: string): [number, number][] {
  if (!polyStr) return [];
  return polyStr
    .split(';')
    .map((pair) => {
      const [lng, lat] = pair.split(',').map(Number);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] as [number, number] : null;
    })
    .filter((p): p is [number, number] => p !== null);
}

function parseNum(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

interface AmapDrivingPath {
  distance?: string | number;
  duration?: string | number;
  tolls?: string | number;
  toll_distance?: string | number;
  strategy?: string;
  steps?: Array<{ polyline?: string }>;
}

function extractRouteFromPath(path: AmapDrivingPath, strategyLabel: string): DrivingRoute {
  const allPoints: [number, number][] = [];
  if (path.steps) {
    for (const step of path.steps) {
      if (step.polyline) {
        allPoints.push(...parsePolylineString(step.polyline));
      }
    }
  }

  return {
    distance: parseNum(path.distance),
    duration: parseNum(path.duration),
    tolls: parseNum(path.tolls),
    tollDistance: parseNum(path.toll_distance),
    strategy: strategyLabel,
    polyline: allPoints,
  };
}

const STRATEGY_MAP: Record<number, string> = {
  0: '推荐路线',
  1: '省钱路线',
  2: '最短距离',
  4: '躲避拥堵',
  5: '不走高速',
};

/**
 * 从高德获取单条策略下的驾车路线（可含多条 paths）。
 */
async function fetchDrivingForStrategy(
  origin: string,
  destination: string,
  waypoints: string | undefined,
  strategy: number,
): Promise<DrivingRoute[]> {
  const key = getKey();
  if (!key) return [];

  const params: Record<string, string> = {
    key,
    origin,
    destination,
    strategy: String(strategy),
    extensions: 'all',
    output: 'json',
  };
  if (waypoints) params.waypoints = waypoints;

  try {
    const res = await fetch(`${DRIVING_URL}?${new URLSearchParams(params)}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== '1' || !data.route?.paths?.length) return [];

    const label = STRATEGY_MAP[strategy] || `策略${strategy}`;
    return data.route.paths.map((p: AmapDrivingPath) => extractRouteFromPath(p, label));
  } catch {
    return [];
  }
}

export interface DrivingRouteRequest {
  corridorPoints: Array<{ lng: number; lat: number; label: string }>;
  strategies?: number[];
}

/**
 * 获取多策略驾车路线。corridorPoints 按顺序：第一个为出发地，最后一个为终点，中间为途经点。
 * 默认返回 3 种策略：推荐(0)、省钱(1)、最短(2)。
 */
export async function getDrivingRoutes(
  req: DrivingRouteRequest,
): Promise<DrivingResult[]> {
  const { corridorPoints, strategies = [0, 1, 2] } = req;

  if (corridorPoints.length < 2) return [];

  const origin = `${corridorPoints[0].lng},${corridorPoints[0].lat}`;
  const destination = `${corridorPoints[corridorPoints.length - 1].lng},${corridorPoints[corridorPoints.length - 1].lat}`;

  let waypoints: string | undefined;
  if (corridorPoints.length > 2) {
    const mid = corridorPoints.slice(1, -1);
    waypoints = mid.map((p) => `${p.lng},${p.lat}`).join(';');
  }

  const results = await Promise.all(
    strategies.map(async (s) => {
      const routes = await fetchDrivingForStrategy(origin, destination, waypoints, s);
      return {
        strategyLabel: STRATEGY_MAP[s] || `策略${s}`,
        routes,
      };
    }),
  );

  return results.filter((r) => r.routes.length > 0);
}

/**
 * 先将地名 geocode 为坐标，再查路线。用于 corridorPoints 尚未解析坐标时。
 */
export async function getDrivingRoutesFromNames(
  placeNames: string[],
  strategies?: number[],
): Promise<DrivingResult[]> {
  if (placeNames.length < 2) return [];

  const coords = await Promise.all(placeNames.map((n) => geocodePlace(n)));
  const validPoints: Array<{ lng: number; lat: number; label: string }> = [];

  for (let i = 0; i < placeNames.length; i++) {
    const c = coords[i];
    if (!c) continue;
    const [lng, lat] = c.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      validPoints.push({ lng, lat, label: placeNames[i] });
    }
  }

  if (validPoints.length < 2) return [];
  return getDrivingRoutes({ corridorPoints: validPoints, strategies });
}
