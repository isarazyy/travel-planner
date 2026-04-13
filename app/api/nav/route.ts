import { NextRequest, NextResponse } from 'next/server';

const AMAP_SEARCH_FALLBACK = 'https://uri.amap.com/search';

/**
 * GET /api/nav?name=趵突泉&city=济南&mode=car
 *
 * Geocodes the place name via AMap, then 302-redirects to AMap navigation URI
 * with real coordinates. Falls back to AMap search if geocoding fails.
 */
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')?.trim();
  if (!name) {
    return NextResponse.json({ error: '缺少 name 参数' }, { status: 400 });
  }

  const city = request.nextUrl.searchParams.get('city')?.trim() || undefined;
  const mode = request.nextUrl.searchParams.get('mode')?.trim() || 'car';

  const key = process.env.AMAP_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) {
    return redirectToSearch(name, city);
  }

  try {
    const geoUrl = new URL('https://restapi.amap.com/v3/geocode/geo');
    geoUrl.searchParams.set('key', key);
    geoUrl.searchParams.set('address', city ? `${city}${name}` : name);
    if (city) geoUrl.searchParams.set('city', city);

    const res = await fetch(geoUrl.toString(), { cache: 'no-store' });
    const data = (await res.json()) as {
      status: string;
      geocodes?: Array<{ location: string; formatted_address?: string }>;
    };

    if (data.status === '1' && data.geocodes?.length) {
      const [lngStr, latStr] = data.geocodes[0].location.split(',');
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);

      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const navUrl = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=${mode}&callnative=1&src=travel-planner`;
        return NextResponse.redirect(navUrl, 302);
      }
    }
  } catch (e) {
    console.error('[nav redirect] geocode error:', e);
  }

  return redirectToSearch(name, city);
}

function redirectToSearch(name: string, city?: string) {
  const q = city ? `${city}${name}` : name;
  const url = `${AMAP_SEARCH_FALLBACK}?keyword=${encodeURIComponent(q)}&view=map&callnative=1&src=travel-planner`;
  return NextResponse.redirect(url, 302);
}
