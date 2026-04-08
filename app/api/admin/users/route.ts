import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase-admin';

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: '未配置 Service Role Key' }, { status: 500 });
  }

  const supabaseAdmin = createAdminClient()!;

  const { data: profiles, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[admin/users] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = profiles || [];
  const today = new Date().toISOString().slice(0, 10);

  const stats = {
    total: all.length,
    todayNew: all.filter((p) => p.created_at?.startsWith(today)).length,
    totalGenerations: all.reduce((s, p) => s + (p.generation_count || 0), 0),
    whitelistedCount: all.filter((p) => p.is_whitelisted).length,
    blacklistedCount: all.filter((p) => p.is_blacklisted).length,
    totalTokens: all.reduce((s, p) => s + (p.total_tokens || 0), 0),
    totalCostYuan: all.reduce((s, p) => s + (parseFloat(p.estimated_cost_yuan) || 0), 0),
  };

  return NextResponse.json({ users: all, stats });
}
