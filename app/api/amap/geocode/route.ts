import { NextRequest, NextResponse } from 'next/server';

/** 高德 Web 服务地理编码，Key 留在服务端（可用 AMAP_KEY，或与前端同 Key） */
function pickBestGeocode(
  list: Array<{ location: string; formatted_address?: string }>,
  cityHint: string | undefined,
): (typeof list)[0] {
  if (list.length <= 1 || !cityHint?.trim()) return list[0];
  const hint = cityHint.trim();
  const short = hint.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区/g, '');
  const preferred = list.find((g) => {
    const f = g.formatted_address || '';
    return f.includes(hint) || (short.length >= 2 && f.includes(short));
  });
  return preferred ?? list[0];
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: '缺少参数 q' }, { status: 400 });
  }

  const cityHint = request.nextUrl.searchParams.get('city')?.trim() || undefined;

  const key = process.env.AMAP_KEY || process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) {
    return NextResponse.json(
      { error: '未配置高德 Key：请在 .env.local 中设置 AMAP_KEY 或 NEXT_PUBLIC_AMAP_KEY' },
      { status: 503 },
    );
  }

  const url = new URL('https://restapi.amap.com/v3/geocode/geo');
  url.searchParams.set('key', key);
  url.searchParams.set('address', q);
  if (cityHint) {
    url.searchParams.set('city', cityHint);
  }

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const data = (await res.json()) as {
      status: string;
      info?: string;
      geocodes?: Array<{ location: string; formatted_address?: string }>;
    };

    if (data.status !== '1') {
      return NextResponse.json(
        { error: data.info || '高德 API 错误', status: data.status },
        { status: 502 },
      );
    }

    if (!data.geocodes?.length) {
      return NextResponse.json(
        { error: '未解析到坐标' },
        { status: 404 },
      );
    }

    const best = pickBestGeocode(data.geocodes, cityHint);
    const [lngStr, latStr] = best.location.split(',');
    const lng = parseFloat(lngStr);
    const lat = parseFloat(latStr);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return NextResponse.json({ error: '坐标格式异常' }, { status: 502 });
    }

    return NextResponse.json({
      lng,
      lat,
      formatted: best.formatted_address ?? null,
    });
  } catch (e) {
    console.error('[amap geocode]', e);
    return NextResponse.json({ error: '地理编码请求失败' }, { status: 502 });
  }
}
