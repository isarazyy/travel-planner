/**
 * Build AMap URI links for opening in the AMap app or web.
 * https://lbs.amap.com/api/uri-api/guide/travel
 */

/** Open a POI search in AMap */
export function buildAmapSearchUrl(name: string, city?: string): string {
  const q = city ? `${city}${name}` : name;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}&callnative=1&src=travel-planner`;
}

/** Geocode + redirect to AMap navigation with real coordinates */
export function buildAmapNavUrl(destName: string, city?: string): string {
  const params = new URLSearchParams({ name: destName });
  if (city) params.set('city', city);
  return `/api/nav?${params.toString()}`;
}

/* ---- Third-party platform search links (via app-link redirect) ---- */

function cleanShopName(name: string, city?: string): string {
  const shop = name.replace(/[（(][^)）]*[)）]/g, '').trim();
  const cityAlreadyInName = city && shop.includes(city);
  return city && !cityAlreadyInName ? `${city} ${shop}` : shop;
}

export function buildDianpingUrl(name: string, city?: string): string {
  const q = cleanShopName(name, city);
  return `/api/app-link?app=dianping&q=${encodeURIComponent(q)}`;
}

export function buildMeituanUrl(name: string, city?: string): string {
  const q = cleanShopName(name, city);
  return `/api/app-link?app=meituan&q=${encodeURIComponent(q)}`;
}

export function buildXiaohongshuUrl(name: string, city?: string): string {
  const q = cleanShopName(name, city);
  return `/api/app-link?app=xiaohongshu&q=${encodeURIComponent(q)}`;
}

export function buildMeituanHotelUrl(name: string, city?: string): string {
  const params = new URLSearchParams({ keyword: name });
  if (city) params.set('city', city);
  return `https://hotel.meituan.com/search/?${params.toString()}`;
}

export function buildCtripHotelUrl(name: string, city?: string): string {
  const q = city ? `${city} ${name}` : name;
  return `https://m.ctrip.com/webapp/hotel/hotellist?keyword=${encodeURIComponent(q)}`;
}
