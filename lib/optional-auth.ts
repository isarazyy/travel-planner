import { createClient } from '@/lib/supabase-server';
import { isSupabaseServerConfigured } from '@/lib/supabase-env';

/**
 * 可选登录：未登录不拦截业务；已登录时可用于写入云端（如保存行程）。
 */
export async function getOptionalUser(): Promise<{
  userId: string | null;
  supabase: Awaited<ReturnType<typeof createClient>> | null;
}> {
  if (!isSupabaseServerConfigured()) {
    return { userId: null, supabase: null };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { userId: user?.id ?? null, supabase };
}
