'use client';

import { useEffect } from 'react';

/**
 * 部署后前端文件名会变；若用户浏览器仍引用旧文件，加载会失败导致页面点不动。
 * 这里监听 chunk 加载失败 / 动态导入失败，自动刷新一次拿最新版本。
 * 用 sessionStorage 加 10 秒节流，避免刷新死循环。
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    const KEY = 'chunk_reload_at';
    const CHUNK_ERR =
      /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

    const tryReload = (msg: string) => {
      if (!msg || !CHUNK_ERR.test(msg)) return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(KEY) || 0);
      } catch {
        /* ignore */
      }
      if (Date.now() - last < 10_000) return; // 已经刚刷过，避免死循环
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => tryReload(e?.message || '');
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      const msg = typeof reason === 'string' ? reason : reason?.message || '';
      tryReload(msg);
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
