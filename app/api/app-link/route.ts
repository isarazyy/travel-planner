import { NextRequest, NextResponse } from 'next/server';

const APP_CONFIG: Record<string, { scheme: (kw: string) => string; web: (kw: string) => string; label: string }> = {
  dianping: {
    scheme: (kw) => `dianping://searchshop?keyword=${encodeURIComponent(kw)}`,
    web: (kw) => `https://m.dianping.com/search/keyword/0/0_${encodeURIComponent(kw)}`,
    label: '大众点评',
  },
  meituan: {
    scheme: (kw) => `imeituan://www.meituan.com/search?query=${encodeURIComponent(kw)}`,
    web: (kw) => `https://i.meituan.com/awp/h5/search-result/index.html?keyword=${encodeURIComponent(kw)}`,
    label: '美团',
  },
  xiaohongshu: {
    scheme: (kw) => `xhsdiscover://search/result?keyword=${encodeURIComponent(kw)}`,
    web: (kw) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(kw)}`,
    label: '小红书',
  },
  douyin: {
    scheme: (kw) => `snssdk1128://search?keyword=${encodeURIComponent(kw)}`,
    web: (kw) => `https://www.douyin.com/search/${encodeURIComponent(kw)}`,
    label: '抖音',
  },
};

/**
 * GET /api/app-link?app=dianping&q=老翁烧烤
 *
 * Returns an HTML page that:
 * 1. Immediately tries to open the native app via URL scheme
 * 2. If still on page after 1.5s, redirects to the web fallback
 */
export async function GET(request: NextRequest) {
  const app = request.nextUrl.searchParams.get('app')?.trim() || '';
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';

  const config = APP_CONFIG[app];
  if (!config || !q) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  const schemeUrl = config.scheme(q);
  const webUrl = config.web(q);
  const label = config.label;

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>正在打开${label}...</title>
<style>
  body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;color:#333}
  .wrap{text-align:center}
  .spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#f97316;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
  @keyframes spin{to{transform:rotate(360deg)}}
  a{color:#f97316;text-decoration:underline}
</style>
</head><body>
<div class="wrap">
  <div class="spinner"></div>
  <p>正在打开${label}...</p>
  <p style="font-size:13px;color:#999;margin-top:12px">没有自动跳转？<a href="${webUrl}">点击这里用网页版</a></p>
</div>
<script>
  var schemeUrl = ${JSON.stringify(schemeUrl)};
  var webUrl = ${JSON.stringify(webUrl)};
  var start = Date.now();

  // Try opening native app
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = schemeUrl;
  document.body.appendChild(iframe);

  // Also try direct location (works better on some devices)
  setTimeout(function(){ window.location.href = schemeUrl; }, 100);

  // If still here after 2s, the app didn't open → go to web version
  setTimeout(function(){
    if (Date.now() - start < 3500) {
      window.location.href = webUrl;
    }
  }, 2000);
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
