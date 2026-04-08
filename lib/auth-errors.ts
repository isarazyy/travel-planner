/** 把 Supabase / 浏览器网络错误翻成可操作的提示 */
export function formatAuthNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (
    low.includes('failed to fetch') ||
    low.includes('networkerror') ||
    low.includes('load failed') ||
    low.includes('network request failed')
  ) {
    return [
      '无法连接到 Supabase（网络请求失败）。',
      '请依次检查：① 本机网络 / 是否需代理访问国际网络；② .env.local 里 NEXT_PUBLIC_SUPABASE_URL 是否与控制台「设置 → API」顶部 Project URL 完全一致；③ 将 NEXT_PUBLIC_SUPABASE_ANON_KEY 改为「Legacy API keys」里的 anon（eyJ 开头长串）再试。',
    ].join('');
  }
  return msg;
}
