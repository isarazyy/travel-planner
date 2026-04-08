import { enrichPlaceQueryForGeocode } from '@/lib/amap-region';
import { geocodeAmapServer, type GeocodeResult } from '@/lib/geocode-amap';

/**
 * 单地名多次尝试，减少「婺源」「景德镇」等短名在高德里解析失败或误配。
 */
export function buildGeocodeCandidates(rawLabel: string): string[] {
  const base = rawLabel.replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const x = s.trim();
    if (!x || seen.has(x)) return;
    seen.add(x);
    out.push(x);
  };

  const enriched = enrichPlaceQueryForGeocode(base);
  push(enriched);
  push(base);

  // 江西赣东北常见：县名单独搜易失败
  if (/婺源/.test(base)) {
    push('婺源县');
    push('上饶市婺源县');
    push('江西省上饶市婺源县');
    push('婺源风景区');
  }
  if (/景德镇/.test(base)) {
    push('景德镇市');
    push('江西省景德镇市');
  }
  if (/庐山/.test(base)) {
    push('庐山市');
  }

  if (!/[省市县区旗盟]/.test(base) && base.length <= 6) {
    push(`${base}市`);
    push(`${base}县`);
  }

  return out;
}

/** 依次尝试候选 query + 可选 city 限定，失败再去掉 city 重试 */
export async function resolveGeocodeWithFallbacks(
  rawLabel: string,
  regionHint?: string,
): Promise<GeocodeResult | null> {
  const candidates = buildGeocodeCandidates(rawLabel);
  for (const q of candidates) {
    let coord = await geocodeAmapServer(q, regionHint ? { city: regionHint } : undefined);
    if (!coord && regionHint) {
      coord = await geocodeAmapServer(q);
    }
    if (!coord && regionHint) {
      const shortCity = regionHint.replace(/省|自治区|壮族自治区|回族自治区|维吾尔自治区|市$/g, '');
      if (shortCity && shortCity !== regionHint) {
        coord = await geocodeAmapServer(q, { city: shortCity });
      }
    }
    if (coord) return coord;
  }
  return null;
}
