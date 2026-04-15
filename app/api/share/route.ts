import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdmin() {
  if (supabaseUrl.length < 10 || serviceKey.length < 10) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.trip || !body?.plans?.length) {
      return NextResponse.json({ error: '缺少方案数据' }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ error: '存储未配置' }, { status: 500 });
    }

    const id = randomUUID();
    const payload = {
      trip: body.trip,
      plans: body.plans,
      recommendations: body.recommendations || null,
      hotelWebSearchUsed: body.hotelWebSearchUsed || false,
      createdAt: new Date().toISOString(),
    };

    const { error } = await admin.storage
      .from('shared-plans')
      .upload(`${id}.json`, JSON.stringify(payload), {
        contentType: 'application/json',
        upsert: false,
      });

    if (error) {
      console.error('[share] upload error:', error.message);
      return NextResponse.json({ error: '保存失败' }, { status: 500 });
    }

    return NextResponse.json({ id });
  } catch (err: any) {
    console.error('[share] error:', err.message);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
