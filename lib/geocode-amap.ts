/** 经本服务代理调用高德地理编码（避免浏览器直连暴露 Key） */

export type GeocodeResult = {
  lng: number;
  lat: number;
  formatted?: string | null;
};

const geoCache = new Map<string, GeocodeResult | null>();

function geoCacheKey(address: string, city?: string): string {
  return `${address}||${city ?? ''}`;
}

class GeoNotFound extends Error {}

async function fetchGeocode(
  q: string,
  city?: string,
): Promise<GeocodeResult> {
  const params = new URLSearchParams({ q });
  if (city?.trim()) params.set('city', city.trim());
  const res = await fetch(`/api/amap/geocode?${params.toString()}`);
  if (res.status === 404) throw new GeoNotFound();
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const j = (await res.json()) as { lng?: number; lat?: number; formatted?: string | null };
  if (typeof j.lng !== 'number' || typeof j.lat !== 'number') throw new GeoNotFound();
  return { lng: j.lng, lat: j.lat, formatted: j.formatted ?? null };
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [600, 1200, 2400];

export async function geocodeAmapServer(
  address: string,
  opts?: { city?: string },
): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;

  const ck = geoCacheKey(q, opts?.city);
  const cached = geoCache.get(ck);
  if (cached !== undefined) return cached;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await fetchGeocode(q, opts?.city);
      geoCache.set(ck, result);
      return result;
    } catch (err) {
      if (err instanceof GeoNotFound) {
        geoCache.set(ck, null);
        return null;
      }
      // Network/server error — retry
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  return null;
}
