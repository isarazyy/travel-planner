import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, isAdminConfigured } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { isSupabaseServerConfigured } from '@/lib/supabase-env';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: '请填写邮箱和密码' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: '密码至少6位' }, { status: 400 });
  }

  // Strategy 1: Use admin API (auto-confirms email)
  if (isAdminConfigured()) {
    const admin = createAdminClient()!;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
        // If user exists but email not confirmed, auto-confirm them
        try {
          const { data: users } = await admin.auth.admin.listUsers();
          const existing = users?.users?.find((u: any) => u.email === email);
          if (existing && !existing.email_confirmed_at) {
            await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
            return NextResponse.json({ success: true, message: '账户已激活，请登录' });
          }
        } catch {}
        return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 });
      }
      console.error('[register] admin createUser error:', error.message);
      return NextResponse.json({ error: error.message || '注册失败' }, { status: 400 });
    }

    // Create user_profiles row
    if (data.user) {
      try {
        await admin.from('user_profiles').upsert({
          user_id: data.user.id,
          email,
          is_whitelisted: false,
          generation_count: 0,
          chat_count: 0,
        }, { onConflict: 'user_id' });
      } catch (e) {
        console.error('[register] user_profiles upsert error:', e);
      }
    }

    return NextResponse.json({ success: true, message: '注册成功，请登录' });
  }

  // Strategy 2: Fallback to regular signup (needs email confirmation)
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: 'Supabase 未配置' }, { status: 500 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    console.error('[register] signUp error:', error.message);
    return NextResponse.json({ error: error.message || '注册失败' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: '注册成功。如需邮箱确认，请查看收件箱。',
    needsConfirmation: true,
  });
}
