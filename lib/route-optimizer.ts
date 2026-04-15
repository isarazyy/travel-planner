/**
 * Server-side route optimizer: geocode → angle-based circular sort → best cut.
 *
 * 1. Geocode all cities via Amap
 * 2. Sort destinations by angle from geographic centroid → guarantees no crossing lines
 * 3. Find the best "cut point" in the circular order to insert departure,
 *    minimizing max(first leg, last leg) so no leg is unreasonably long
 * 4. Choose direction where first leg is shorter
 */

type Coord = { lng: number; lat: number; name: string };

// ── Geocoding ──────────────────────────────────────────────

const RETRY_DELAYS = [300, 800, 1500];

async function geocodeDirect(
  address: string,
  key: string,
): Promise<{ lng: number; lat: number } | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const url = new URL('https://restapi.amap.com/v3/geocode/geo');
      url.searchParams.set('key', key);
      url.searchParams.set('address', address);

      const res = await fetch(url.toString(), { cache: 'no-store' });
      const data = (await res.json()) as {
        status: string;
        info?: string;
        geocodes?: Array<{ location: string }>;
      };

      if (data.info === 'CUQPS_HAS_EXCEEDED_THE_LIMIT') {
        if (attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
        return null;
      }

      if (data.status !== '1' || !data.geocodes?.length) return null;
      const [lngS, latS] = data.geocodes[0].location.split(',');
      const lng = parseFloat(lngS);
      const lat = parseFloat(latS);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { lng, lat };
    } catch {
      if (attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      return null;
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Haversine distance (km) ────────────────────────────────

function haversine(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Angle-based sort + best cut ────────────────────────────

function computeOptimalOrder(
  departure: Coord,
  destinations: Coord[],
): Coord[] {
  const all = [departure, ...destinations];

  // Step 1: centroid of all points
  const centLat = all.reduce((s, c) => s + c.lat, 0) / all.length;
  const centLng = all.reduce((s, c) => s + c.lng, 0) / all.length;

  // Step 2: sort destinations by angle from centroid (initial non-crossing order)
  const sorted = [...destinations].sort(
    (a, b) =>
      Math.atan2(a.lat - centLat, a.lng - centLng) -
      Math.atan2(b.lat - centLat, b.lng - centLng),
  );

  const n = sorted.length;
  if (n <= 1) return sorted;

  // Step 3: find the best cut point
  let bestCut = 0;
  let bestScore = Infinity;

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const score =
      haversine(departure, sorted[nextIdx]) +
      haversine(sorted[i], departure);
    if (score < bestScore) {
      bestScore = score;
      bestCut = i;
    }
  }

  const startIdx = (bestCut + 1) % n;
  const forward: Coord[] = [];
  for (let k = 0; k < n; k++) {
    forward.push(sorted[(startIdx + k) % n]);
  }

  // Step 4: choose direction where the LAST leg (return home) is shorter
  const reversed = [...forward].reverse();
  const lastFwd = haversine(forward[forward.length - 1], departure);
  const lastRev = haversine(reversed[reversed.length - 1], departure);

  return lastFwd <= lastRev ? forward : reversed;
}

// ── Public API ─────────────────────────────────────────────

export type OptimizedRoute = {
  order: string[];
  description: string;
  totalKm: number;
};

export async function optimizeRoute(
  departure: string,
  destinations: string[],
): Promise<OptimizedRoute | null> {
  if (!destinations?.length || destinations.length < 2) return null;

  const key = process.env.AMAP_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) {
    console.warn('[route-optimizer] no AMAP_KEY, skipping');
    return null;
  }

  const allCities = [departure, ...destinations];
  const coords: (Coord | null)[] = [];
  for (const city of allCities) {
    const geo = await geocodeDirect(city, key);
    coords.push(geo ? { ...geo, name: city } : null);
    if (coords.length < allCities.length) await sleep(200);
  }

  const failed = coords
    .map((c, i) => (c ? null : allCities[i]))
    .filter(Boolean);
  if (failed.length > 0) {
    console.warn('[route-optimizer] geocode failed for:', failed.join(', '));
  }
  if (!coords[0]) {
    console.warn('[route-optimizer] departure geocode failed, skipping');
    return null;
  }

  const depCoord = coords[0]!;
  const destCoords = coords.slice(1).filter((c): c is Coord => c !== null);
  if (destCoords.length < 2) return null;

  const ordered = computeOptimalOrder(depCoord, destCoords);
  const orderedNames = ordered.map((c) => c.name);

  const validNames = new Set(ordered.map((c) => c.name));
  for (const dest of destinations) {
    if (!validNames.has(dest)) {
      orderedNames.push(dest);
    }
  }

  // Log with per-leg distances
  let totalKm = haversine(depCoord, ordered[0]);
  const legs: string[] = [
    `${departure}→${ordered[0].name}(${Math.round(haversine(depCoord, ordered[0]))}km)`,
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    const d = haversine(ordered[i], ordered[i + 1]);
    totalKm += d;
    legs.push(`${ordered[i].name}→${ordered[i + 1].name}(${Math.round(d)}km)`);
  }
  const lastLeg = haversine(ordered[ordered.length - 1], depCoord);
  totalKm += lastLeg;
  legs.push(`${ordered[ordered.length - 1].name}→${departure}(${Math.round(lastLeg)}km)`);

  const routeStr = `${departure}→${orderedNames.join('→')}→${departure}`;
  console.log(
    '[route-optimizer]',
    routeStr,
    `total=${Math.round(totalKm)}km`,
    'legs:',
    legs.join(' | '),
  );

  return {
    order: orderedNames,
    description: `${routeStr}（直线距离约${Math.round(totalKm)}km）`,
    totalKm,
  };
}
