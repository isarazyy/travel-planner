import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: '未配置 Service Role Key' }, { status: 500 });
  }

  let body: { userId?: string; whitelisted?: boolean; blacklisted?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: '参数不完整' }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient()!;
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.whitelisted === 'boolean') {
    updates.is_whitelisted = body.whitelisted;
  }
  if (typeof body.blacklisted === 'boolean') {
    updates.is_blacklisted = body.blacklisted;
    if (body.blacklisted) updates.is_whitelisted = false;
  }

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .update(updates)
    .eq('user_id', body.userId);

  if (error) {
    console.error('[admin/whitelist] update error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
