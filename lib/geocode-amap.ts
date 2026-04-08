/** 经本服务代理调用高德地理编码（避免浏览器直连暴露 Key） */

export type GeocodeResult = {
  lng: number;
  lat: number;
  formatted?: string | null;
};

export async function geocodeAmapServer(
  address: string,
  opts?: { city?: string },
): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const params = new URLSearchParams({ q });
    if (opts?.city?.trim()) {
      params.set('city', opts.city.trim());
    }
    const res = await fetch(`/api/amap/geocode?${params.toString()}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { lng?: number; lat?: number; formatted?: string | null };
    if (typeof j.lng !== 'number' || typeof j.lat !== 'number') return null;
    return { lng: j.lng, lat: j.lat, formatted: j.formatted ?? null };
  } catch {
    return null;
  }
}
