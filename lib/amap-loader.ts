/** 浏览器端加载高德 JS API 2.0（需 NEXT_PUBLIC_AMAP_KEY；新 Key 常需安全密钥） */

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

/** 最小类型，避免引入 @types/amap-js-api-v2 */
export type AMapNamespace = {
  Map: new (
    container: string | HTMLElement,
    opts?: { zoom?: number; center?: [number, number]; viewMode?: string },
  ) => AMapMapInstance;
  Marker: new (opts: Record<string, unknown>) => unknown;
  Polyline: new (opts: Record<string, unknown>) => unknown;
  InfoWindow: new (opts: Record<string, unknown>) => AMapInfoWindowInstance;
};

export type AMapMapInstance = {
  clearMap: () => void;
  add: (overlay: unknown | unknown[]) => void;
  remove: (overlay: unknown | unknown[]) => void;
  setFitView: (overlays?: unknown, immediately?: boolean, avoid?: [number, number, number, number]) => void;
  setZoomAndCenter: (zoom: number, center: [number, number]) => void;
  destroy: () => void;
};

type AMapInfoWindowInstance = {
  open: (map: AMapMapInstance, position: [number, number]) => void;
};

export function getAmapBrowserKey(): string | undefined {
  return process.env.NEXT_PUBLIC_AMAP_KEY;
}

export function loadAmapScript(): Promise<AMapNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('SSR'));
  }
  if (window.AMap) {
    return Promise.resolve(window.AMap);
  }

  const key = process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) {
    return Promise.reject(new Error('NO_AMAP_KEY'));
  }

  const security = process.env.NEXT_PUBLIC_AMAP_SECURITY_JSCODE;
  if (security) {
    window._AMapSecurityConfig = { securityJsCode: security };
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.AMap) resolve(window.AMap);
        else reject(new Error('AMAP_LOAD_EMPTY'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.dataset.amapMaps = '1';
    script.onload = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('AMAP_LOAD_EMPTY'));
    };
    script.onerror = () => reject(new Error('AMAP_SCRIPT_ERROR'));
    document.head.appendChild(script);
  });
}
