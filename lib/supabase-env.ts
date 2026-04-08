/** 服务端判断 Supabase 是否已配置（与 middleware / 浏览器 isConfigured 逻辑一致） */
export function isSupabaseServerConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.length < 10 || key.length < 10) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
