/**
 * Build AMap URI links for opening in the AMap app or web.
 * https://lbs.amap.com/api/uri-api/guide/travel
 */

/** Open a POI search in AMap */
export function buildAmapSearchUrl(name: string, city?: string): string {
  const q = city ? `${city}${name}` : name;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}&callnative=1&src=travel-planner`;
}

/** Open navigation to a named destination */
export function buildAmapNavUrl(destName: string, city?: string): string {
  const q = city ? `${city}${destName}` : destName;
  return `https://uri.amap.com/navigation?to=,${encodeURIComponent(q)}&mode=car&callnative=1&src=travel-planner`;
}
