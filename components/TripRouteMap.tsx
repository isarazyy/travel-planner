'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  collectActivityPoiLabels,
  collectCorridorRouteLabels,
  type RoutePointKind,
  type ActivityPoiLabel,
} from '@/lib/trip-route-points';
import { enrichPlaceQueryForGeocode, extractRegionHintFromFormatted } from '@/lib/amap-region';
import { resolveGeocodeWithFallbacks } from '@/lib/amap-geocode-resolve';
import { geocodeAmapServer } from '@/lib/geocode-amap';
import { loadAmapScript, getAmapBrowserKey, type AMapMapInstance } from '@/lib/amap-loader';

function kindLabel(k: RoutePointKind): string {
  if (k === 'departure') return '出发地';
  if (k === 'destination') return '目的地';
  return '行程点';
}

function extractCityName(departure: string): string {
  const known = ['北京', '上海', '天津', '重庆', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '长沙', '昆明', '贵阳', '福州', '厦门', '合肥', '郑州', '济南', '青岛', '大连', '沈阳', '哈尔滨', '长春', '南宁', '海口', '兰州', '银川', '西宁', '拉萨', '呼和浩特', '乌鲁木齐', '石家庄', '太原', '南昌'];
  for (const c of known) {
    if (departure.includes(c)) return c;
  }
  const m = departure.match(/^([\u4e00-\u9fa5]{2,4}?)(?:市|区|县|镇|村|路|街|小区|家园|花园|公寓)/);
  if (m) return m[1];
  return departure.slice(0, 3);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEO_GAP_MS = 120;

interface TripLike {
  departure: string;
  destinations: string[];
  destination?: string | null;
}

type CorridorPoint = {
  label: string;
  kind: RoutePointKind;
  lng: number;
  lat: number;
  order: number;
};

type DailyPoint = { label: string; lng: number; lat: number };

interface DrivingRouteData {
  distance: number;
  duration: number;
  tolls: number;
  tollDistance: number;
  strategy: string;
  polyline: [number, number][];
}

interface DrivingStrategyResult {
  strategyLabel: string;
  routes: DrivingRouteData[];
}

const ROUTE_COLORS = ['#ea580c', '#2563eb', '#059669'];
const ROUTE_COLORS_INACTIVE = ['#fdba74', '#93c5fd', '#6ee7b7'];

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(0)}km`;
  return `${Math.round(m)}m`;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export default function TripRouteMap({
  trip,
  recommendedRoute,
  itinerary,
  transportModes,
  isMountainRun: isMountainRunProp,
}: {
  trip: TripLike;
  recommendedRoute?: string | null;
  itinerary?: Array<{ activities?: Array<{ location?: string }> }>;
  transportModes?: string[];
  isMountainRun?: boolean;
}) {
  const hasJsKey = !!getAmapBrowserKey();
  const isSelfDrive = transportModes?.includes('self_drive') ?? false;
  const isMotorcycle = transportModes?.includes('motorcycle') ?? false;
  const isMountainRun = isMountainRunProp ?? false;
  const showDrivingRoute = isSelfDrive || isMotorcycle || isMountainRun;
  const [showDailyPois, setShowDailyPois] = useState(isMotorcycle || isMountainRun);

  const corridorLabels = useMemo(() => {
    // Mountain run / motorcycle: don't use recommendedRoute (contains route descriptions, not place names)
    const skipRecommendedRoute = isMotorcycle || isMountainRun;
    const labels = collectCorridorRouteLabels({
      departure: trip.departure,
      destinations: trip.destinations || [],
      destinationSummary: trip.destination ?? undefined,
      recommendedRoute: skipRecommendedRoute ? undefined : (recommendedRoute ?? undefined),
    });
    // For mountain run / motorcycle, build corridor from activity locations instead
    if (skipRecommendedRoute && labels.length <= 1 && itinerary?.length) {
      const seen = new Set(labels.map((l) => l.label));
      const routeDescPattern = /环线|往返|路段|国道|省道|km|公里|→|线路|全程|S\d{3}|G\d{3}/;
      for (const day of itinerary) {
        for (const act of day.activities || []) {
          const loc = act.location?.trim();
          if (loc && loc.length >= 2 && loc.length <= 20 && !seen.has(loc) && !routeDescPattern.test(loc)) {
            seen.add(loc);
            labels.push({ label: loc, kind: 'destination' });
          }
        }
      }
      // Mountain run: close the loop — add departure as final point so the route draws back home
      if (isMountainRun && labels.length > 1) {
        labels.push({ label: trip.departure, kind: 'departure' });
      }
    }

    // Self-drive / motorcycle: close loop back to departure if last point isn't already departure
    if ((isSelfDrive || isMotorcycle) && labels.length > 1) {
      const last = labels[labels.length - 1];
      const depKey = trip.departure.replace(/[市区县省]$/, '').trim();
      const lastKey = last.label.replace(/[市区县省]$/, '').trim();
      if (last.kind !== 'departure' && lastKey !== depKey && !lastKey.includes(depKey) && !depKey.includes(lastKey)) {
        labels.push({ label: trip.departure, kind: 'departure' });
      }
    }

    return labels;
  }, [trip.departure, trip.destinations, trip.destination, recommendedRoute, isMotorcycle, isMountainRun, itinerary]);

  const activityLabelList = useMemo(() => {
    if (!itinerary?.length) return [];
    return collectActivityPoiLabels({
      departure: trip.departure,
      destinations: trip.destinations || [],
      itinerary,
      corridor: corridorLabels,
    });
  }, [trip.departure, trip.destinations, itinerary, corridorLabels]);

  const [corridorResolved, setCorridorResolved] = useState<CorridorPoint[]>([]);
  const [dailyResolved, setDailyResolved] = useState<DailyPoint[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'config'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [mapError, setMapError] = useState<string | null>(null);
  const [corridorSkipped, setCorridorSkipped] = useState<string[]>([]);

  const [drivingResults, setDrivingResults] = useState<DrivingStrategyResult[]>([]);
  const [activeRouteIdx, setActiveRouteIdx] = useState(0);
  const [drivingLoading, setDrivingLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMapInstance | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Geocode corridor + daily points
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!hasJsKey) {
        setCorridorResolved([]);
        setDailyResolved([]);
        setCorridorSkipped([]);
        setPhase('config');
        return;
      }
      if (corridorLabels.length === 0) {
        setCorridorResolved([]);
        setDailyResolved([]);
        setCorridorSkipped([]);
        setPhase('empty');
        return;
      }

      const dailyCount = showDailyPois && activityLabelList.length > 0 ? activityLabelList.length : 0;
      const totalSteps = corridorLabels.length + dailyCount;

      setPhase('loading');
      setProgress({ done: 0, total: Math.max(1, totalSteps) });

      const corridorOk: CorridorPoint[] = [];
      // Mountain run: extract city name from departure for region hint
      // "北京京旺家园" → "北京", so AMap geocodes within the correct city
      const mountainCityHint = isMountainRun ? extractCityName(trip.departure) : undefined;
      let regionHint: string | undefined = mountainCityHint;
      const MR_MAX_DIST_KM = 250; // mountain run: discard points > 250km from departure

      for (let i = 0; i < corridorLabels.length; i++) {
        if (cancelled) return;
        if (i > 0) await new Promise((r) => setTimeout(r, GEO_GAP_MS));
        const rawLabel = corridorLabels[i].label;
        const kind = corridorLabels[i].kind;

        let coord = await resolveGeocodeWithFallbacks(rawLabel, regionHint);

        // Mountain run: if city-restricted geocoding fails, try with just the city name
        if (!coord && isMountainRun && mountainCityHint) {
          coord = await geocodeAmapServer(rawLabel, { city: mountainCityHint });
        }

        if (coord && kind === 'destination' && !regionHint) {
          const hint = extractRegionHintFromFormatted(coord.formatted);
          if (hint) regionHint = hint;
        }

        // Mountain run distance check: discard points that are too far from departure
        if (coord && isMountainRun && corridorOk.length > 0) {
          const depPt = corridorOk[0];
          const dist = haversineKm(depPt.lat, depPt.lng, coord.lat, coord.lng);
          if (dist > MR_MAX_DIST_KM) {
            coord = null; // too far, discard
          }
        }

        setProgress({ done: corridorOk.length + 1, total: totalSteps });
        if (coord) {
          corridorOk.push({
            label: rawLabel,
            kind,
            lng: coord.lng,
            lat: coord.lat,
            order: corridorOk.length + 1,
          });
        }
      }

      if (cancelled) return;
      const skipped = corridorLabels
        .map((c) => c.label)
        .filter((lab) => !corridorOk.some((p) => p.label === lab));
      setCorridorSkipped(skipped);
      setCorridorResolved(corridorOk);

      const depPoint = corridorOk.length > 0 ? corridorOk[0] : null;
      const dailyOk: DailyPoint[] = [];
      if (showDailyPois && activityLabelList.length > 0) {
        for (let j = 0; j < activityLabelList.length; j++) {
          if (cancelled) return;
          if (j > 0) await new Promise((r) => setTimeout(r, GEO_GAP_MS));
          const poi = activityLabelList[j];
          const raw = typeof poi === 'string' ? poi : poi.label;
          const poiCityHint = typeof poi === 'string' ? undefined : poi.cityHint;
          const hint = poiCityHint || regionHint;
          const query = enrichPlaceQueryForGeocode(raw);
          let coord = await geocodeAmapServer(query, hint ? { city: hint } : undefined);
          // Mountain run: do NOT fall back to no-city geocoding — prevents cross-country mismatches
          if (!coord && hint && !isMountainRun) {
            coord = await geocodeAmapServer(query);
          }
          // Distance check for mountain run
          if (coord && isMountainRun && depPoint) {
            const dist = haversineKm(depPoint.lat, depPoint.lng, coord.lat, coord.lng);
            if (dist > MR_MAX_DIST_KM) coord = null;
          }
          setProgress({ done: corridorOk.length + dailyOk.length + 1, total: totalSteps });
          if (coord) {
            dailyOk.push({ label: raw, lng: coord.lng, lat: coord.lat });
          }
        }
      }

      if (cancelled) return;
      setDailyResolved(dailyOk);
      setPhase(corridorOk.length === 0 ? 'empty' : 'ready');
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [corridorLabels, hasJsKey, showDailyPois, activityLabelList]);

  // Fetch driving routes when self_drive/motorcycle mode + corridor resolved
  useEffect(() => {
    if (!showDrivingRoute || corridorResolved.length < 2) {
      setDrivingResults([]);
      return;
    }

    let cancelled = false;
    setDrivingLoading(true);

    (async () => {
      try {
        const strategies = isMotorcycle
          ? [5, 2, 0]  // motorcycle: avoid highways first, then shortest, then recommended
          : (isMountainRun ? [5, 0, 2] : [0, 1, 2]); // mountain run: avoid highways first; car: recommended, cheapest, shortest
        const body = {
          corridorPoints: corridorResolved.map((p) => ({ lng: p.lng, lat: p.lat, label: p.label })),
          strategies,
        };
        const res = await fetch('/api/driving-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        if (!cancelled) {
          setDrivingResults(data.results || []);
          setActiveRouteIdx(0);
        }
      } catch (err) {
        console.error('[TripRouteMap] driving route fetch error:', err);
        if (!cancelled) setDrivingResults([]);
      } finally {
        if (!cancelled) setDrivingLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showDrivingRoute, isMotorcycle, isMountainRun, corridorResolved]);

  // Initialize map
  useEffect(() => {
    if (!hasJsKey) return;

    let destroyed = false;
    setMapError(null);

    loadAmapScript()
      .then(() => {
        if (destroyed || !containerRef.current) return;
        const AMap = window.AMap;
        if (!AMap) {
          setMapError('高德脚本未就绪');
          return;
        }
        const map = new AMap.Map(containerRef.current, {
          zoom: 4.5,
          center: [106.0, 33.5],
          viewMode: '2D',
        });
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err: Error) => {
        if (err.message === 'NO_AMAP_KEY') {
          setMapError('未配置 NEXT_PUBLIC_AMAP_KEY');
        } else {
          setMapError('地图加载失败，请检查 Key、安全密钥与网络');
        }
      });

    return () => {
      destroyed = true;
      try {
        mapRef.current?.destroy();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [hasJsKey]);

  // Draw overlays
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!AMap) return;

    map.clearMap();

    if (corridorResolved.length === 0) return;

    const straightPath: [number, number][] = corridorResolved.map((p) => [p.lng, p.lat]);

    // Markers for corridor points
    for (const p of corridorResolved) {
      const marker = new AMap.Marker({
        position: [p.lng, p.lat] as unknown as number[],
        anchor: 'center',
        title: `${kindLabel(p.kind)}：${p.label}`,
        content: `<div class="trip-route-marker">${p.order}</div>`,
        zIndex: 120,
      });
      const m = marker as { on: (ev: string, fn: () => void) => void };
      m.on('click', () => {
        const Pixel = (AMap as unknown as { Pixel: new (x: number, y: number) => unknown }).Pixel;
        const iw = new AMap.InfoWindow({
          content: `<div style="padding:8px 10px;font-size:13px;line-height:1.5;"><strong style="color:#111">${escapeHtml(p.label)}</strong><br/><span style="color:#666">${kindLabel(p.kind)}</span></div>`,
          offset: new Pixel(0, -18),
        });
        iw.open(map, [p.lng, p.lat]);
      });
      map.add(marker);
    }

    // Daily POI markers
    for (const d of dailyResolved) {
      const marker = new AMap.Marker({
        position: [d.lng, d.lat] as unknown as number[],
        anchor: 'center',
        title: `行程点：${d.label}`,
        content: `<div class="trip-route-marker-daily"></div>`,
      });
      const m = marker as { on: (ev: string, fn: () => void) => void };
      m.on('click', () => {
        const Pixel = (AMap as unknown as { Pixel: new (x: number, y: number) => unknown }).Pixel;
        const iw = new AMap.InfoWindow({
          content: `<div style="padding:8px 10px;font-size:13px;line-height:1.5;"><strong style="color:#111">${escapeHtml(d.label)}</strong></div>`,
          offset: new Pixel(0, -14),
        });
        iw.open(map, [d.lng, d.lat]);
      });
      map.add(marker);
    }

    // Self-drive / motorcycle mode: draw driving route polylines
    if (showDrivingRoute && drivingResults.length > 0) {
      // Draw all strategies' routes, highlight active one
      drivingResults.forEach((sr, sIdx) => {
        if (!sr.routes.length) return;
        const route = sr.routes[0];
        if (!route.polyline.length) return;

        const isActive = sIdx === activeRouteIdx;
        const polyline = new AMap.Polyline({
          path: route.polyline as unknown as number[][],
          strokeColor: isActive ? ROUTE_COLORS[sIdx % ROUTE_COLORS.length] : ROUTE_COLORS_INACTIVE[sIdx % ROUTE_COLORS_INACTIVE.length],
          strokeWeight: isActive ? 6 : 3,
          strokeOpacity: isActive ? 0.9 : 0.45,
          lineJoin: 'round',
          lineCap: 'round',
          zIndex: isActive ? 100 : 50,
        });
        map.add(polyline);
      });
    } else {
      // Fallback: straight line for non-self-drive or no driving data
      if (straightPath.length >= 2) {
        const polyline = new AMap.Polyline({
          path: straightPath as unknown as number[][],
          strokeColor: '#ea580c',
          strokeWeight: 4,
          strokeOpacity: 0.85,
          lineJoin: 'round',
        });
        map.add(polyline);
      }
    }

    // Fit view
    const allPoints: [number, number][] = [];
    if (showDrivingRoute && drivingResults.length > 0) {
      const active = drivingResults[activeRouteIdx]?.routes[0];
      if (active?.polyline.length) {
        // Sample some points from the polyline for fit view (avoid too many)
        const step = Math.max(1, Math.floor(active.polyline.length / 50));
        for (let i = 0; i < active.polyline.length; i += step) {
          allPoints.push(active.polyline[i]);
        }
        allPoints.push(active.polyline[active.polyline.length - 1]);
      }
    }
    if (allPoints.length === 0) {
      allPoints.push(...straightPath);
    }
    allPoints.push(...dailyResolved.map((d) => [d.lng, d.lat] as [number, number]));

    if (allPoints.length === 1) {
      map.setZoomAndCenter(11, allPoints[0]);
    } else if (allPoints.length >= 2) {
      map.setFitView(undefined, false, [52, 52, 52, 52]);
    }
  }, [mapReady, corridorResolved, dailyResolved, showDrivingRoute, drivingResults, activeRouteIdx]);

  if (phase === 'config' || !hasJsKey) {
    return (
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 mb-6 text-sm text-amber-900">
        <p className="font-semibold mb-2">🗺️ 使用高德地图前请先配置 Key</p>
        <p className="text-amber-800/95 leading-relaxed mb-2">
          在「<a href="https://console.amap.com/" className="underline font-medium" target="_blank" rel="noreferrer">高德开放平台</a>
          」创建应用，勾选 <strong>Web端(JS API)</strong> 与 <strong>Web服务</strong>（地理编码），把 Key 写入项目根目录{' '}
          <code className="bg-amber-100/80 px-1 rounded">.env.local</code>：
        </p>
        <pre className="text-xs bg-white/80 border border-amber-100 rounded-lg p-3 overflow-x-auto text-gray-800">
{`NEXT_PUBLIC_AMAP_KEY=你的Key
# 2021年12月后申请的 Key 通常需要安全密钥：
NEXT_PUBLIC_AMAP_SECURITY_JSCODE=你的安全密钥
# 可选（与上面 Key 可相同，用于服务端地理编码；不填则用 NEXT_PUBLIC_AMAP_KEY）
AMAP_KEY=`}
        </pre>
        <p className="text-xs text-amber-700/90 mt-2">修改后请重启 <code className="bg-amber-100/80 px-1 rounded">npm run dev</code>。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <h3 className="font-semibold text-gray-900 shrink-0">
            {isMountainRun ? '⛰️ 跑山路线地图' : isSelfDrive ? '🚗 自驾路线地图' : isMotorcycle ? '🏍️ 骑行路线地图' : '🗺️ 路线地图（高德）'}
          </h3>
          {activityLabelList.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                checked={showDailyPois}
                onChange={(e) => setShowDailyPois(e.target.checked)}
              />
              <span>显示每日行程地点</span>
            </label>
          )}
        </div>
        {phase === 'loading' && (
          <span className="text-xs text-gray-500 tabular-nums">
            正在解析地点 {progress.done}/{progress.total}
          </span>
        )}
        {drivingLoading && (
          <span className="text-xs text-blue-600 animate-pulse">正在获取驾车路线…</span>
        )}
        {phase === 'empty' && (
          <span className="text-xs text-amber-700">未能解析到坐标，行程里尽量写「市+区/景点」等具体地名</span>
        )}
        {phase === 'ready' && !drivingLoading && (
          <span className="text-xs text-gray-500 max-w-[min(100%,28rem)] text-right">
            {corridorSkipped.length > 0 ? (
              <span className="text-amber-700">
                部分地点未能定位（{corridorSkipped.join('、')}），路线可能不完整
              </span>
            ) : showDrivingRoute && drivingResults.length > 0 ? (
              '点击下方标签切换不同路线方案'
            ) : showDailyPois && dailyResolved.length > 0 ? (
              `橙线+序号：主路线；灰点：每日行程地点（${dailyResolved.length} 个）`
            ) : (
              '序号：出发地 → 目的地顺序；橙线为大致路线'
            )}
          </span>
        )}
        {mapError && <span className="text-xs text-red-600">{mapError}</span>}
      </div>

      {/* Driving route selector */}
      {showDrivingRoute && drivingResults.length > 0 && !drivingLoading && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <div className="flex flex-wrap gap-2">
            {drivingResults.map((sr, idx) => {
              const route = sr.routes[0];
              if (!route) return null;
              const isActive = idx === activeRouteIdx;
              const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
              return (
                <button
                  key={idx}
                  onClick={() => setActiveRouteIdx(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                    isActive
                      ? 'bg-white shadow-sm border border-gray-200 font-semibold'
                      : 'bg-transparent border border-transparent hover:bg-white/60'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: color, opacity: isActive ? 1 : 0.5 }}
                  />
                  <span className="flex flex-col items-start">
                    <span className={isActive ? 'text-gray-900' : 'text-gray-600'}>
                      {sr.strategyLabel}
                    </span>
                    <span className="text-gray-400 mt-0.5">
                      {formatDistance(route.distance)} · {formatDuration(route.duration)}
                      {route.tolls > 0 && ` · 过路费¥${route.tolls}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {/* Active route summary */}
          {drivingResults[activeRouteIdx]?.routes[0] && (() => {
            const r = drivingResults[activeRouteIdx].routes[0];
            const hours = Math.floor(r.duration / 3600);
            const mins = Math.floor((r.duration % 3600) / 60);
            const km = (r.distance / 1000).toFixed(1);
            const tollKm = r.tollDistance > 0 ? (r.tollDistance / 1000).toFixed(1) : null;
            return (
              <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>全程 <strong className="text-gray-900">{km}公里</strong></span>
                <span>预计 <strong className="text-gray-900">{hours > 0 ? `${hours}小时${mins}分` : `${mins}分钟`}</strong></span>
                {r.tolls > 0 && <span>过路费 <strong className="text-orange-600">¥{r.tolls}</strong></span>}
                {tollKm && <span>高速段 {tollKm}km</span>}
              </div>
            );
          })()}
        </div>
      )}

      <div className="relative h-[min(420px,55vh)] w-full bg-gray-100">
        <div ref={containerRef} className="h-full w-full" />
        {mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm text-red-600 pointer-events-none px-4 text-center">
            {mapError}
          </div>
        )}
        {(phase === 'loading' || !mapReady || drivingLoading) && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 text-sm text-gray-600 pointer-events-none">
            {drivingLoading ? '正在规划驾车路线…' : phase === 'loading' ? '正在解析地点…' : '地图加载中…'}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50">
        <p className="text-[11px] text-gray-400">
          地图服务 © 高德 · 位置仅供参考
        </p>
        {corridorResolved.length >= 2 && (
          <a
            href={buildAmapRouteUrl(corridorResolved, showDrivingRoute)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition whitespace-nowrap"
          >
            🗺️ 在高德中打开
          </a>
        )}
      </div>
    </div>
  );
}

function pickEvenlySpaced<T>(arr: T[], maxCount: number): T[] {
  if (arr.length <= maxCount) return arr;
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.round((i * (arr.length - 1)) / (maxCount - 1));
    result.push(arr[idx]);
  }
  return result;
}

function buildAmapRouteUrl(points: CorridorPoint[], isDriving: boolean): string {
  const from = points[0];
  const to = points[points.length - 1];
  const mid = points.slice(1, -1);

  if (isDriving && mid.length > 3) {
    const waypoints = pickEvenlySpaced(mid, 16);
    const params = new URLSearchParams({ type: '1', policy: '1' });
    params.set('from', `${from.lng},${from.lat},${encodeURIComponent(from.label)}`);
    params.set('to', `${to.lng},${to.lat},${encodeURIComponent(to.label)}`);
    const viaStr = waypoints
      .map((p) => `${p.lng},${p.lat},${encodeURIComponent(p.label)}`)
      .join(';');
    params.set('via', viaStr);
    return `https://uri.amap.com/navigation?${params.toString()}&mode=car&callnative=1&coordinate=gaode&src=travel-planner`;
  }

  const mode = isDriving ? 'car' : 'bus';
  let url = 'https://uri.amap.com/navigation?';
  url += `from=${from.lng},${from.lat},${encodeURIComponent(from.label)}`;
  url += `&to=${to.lng},${to.lat},${encodeURIComponent(to.label)}`;

  if (mid.length > 0) {
    const selected = pickEvenlySpaced(mid, 3);
    const via = selected
      .map((p) => `${p.lng},${p.lat},${encodeURIComponent(p.label)}`)
      .join(';');
    url += `&via=${via}`;
  }

  url += `&mode=${mode}&callnative=1&coordinate=gaode&src=travel-planner`;
  return url;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
