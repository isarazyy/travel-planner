import { NextRequest, NextResponse } from 'next/server';
import { getDrivingRoutes, type DrivingRouteRequest } from '@/lib/amap-driving';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DrivingRouteRequest;

    if (!body.corridorPoints || body.corridorPoints.length < 2) {
      return NextResponse.json({ error: '至少需要 2 个途经点' }, { status: 400 });
    }

    if (body.corridorPoints.length > 18) {
      return NextResponse.json({ error: '途经点不能超过 18 个' }, { status: 400 });
    }

    const results = await getDrivingRoutes(body);

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[driving-route] error:', err);
    return NextResponse.json({ error: '获取驾车路线失败' }, { status: 500 });
  }
}
