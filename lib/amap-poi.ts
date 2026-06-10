const AMAP_PLACE_TEXT = 'https://restapi.amap.com/v3/place/text';

/** 餐饮 */
const TYPES_RESTAURANTS = '050000';
/** 住宿（高德分类：住宿服务） */
const TYPES_HOTELS = '100000';
/** 风景名胜 / 景点 */
const TYPES_ATTRACTIONS = '110000';

export interface AmapPOI {
  id: string;
  name: string;
  type: string;
  address: string;
  location: string;
  tel: string;
  rating: string;
  cost: string;
  openTime: string;
  cityName: string;
  adName: string;
  /** 高德返回的实景图片地址（取首张可用图） */
  photo: string;
}

type BizExt = {
  rating?: string;
  cost?: string;
  open_time?: string;
  opentime?: string;
};

type AmapPhoto = {
  title?: string;
  url?: string;
};

type AmapRawPOI = {
  id?: string;
  name?: string;
  type?: string;
  address?: string;
  location?: string;
  tel?: string;
  adname?: string;
  cityname?: string;
  biz_ext?: string | BizExt | null;
  photos?: AmapPhoto[] | null;
};

type AmapPlaceTextResponse = {
  status?: string;
  info?: string;
  infocode?: string;
  pois?: AmapRawPOI[];
};

function parseBizExt(raw: AmapRawPOI['biz_ext']): BizExt {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BizExt;
    } catch {
      return {};
    }
  }
  return raw;
}

/** Amap returns `[]` (empty array) for missing fields; normalize to string. */
function safeStr(v: unknown): string {
  if (v == null || (Array.isArray(v) && v.length === 0)) return '';
  return String(v).trim();
}

function firstPhotoUrl(photos: AmapRawPOI['photos']): string {
  if (!Array.isArray(photos)) return '';
  for (const ph of photos) {
    const url = safeStr(ph?.url);
    if (url && /^https?:\/\//.test(url)) {
      // 高德图片默认是 http，统一升级到 https 避免混合内容被浏览器拦截
      return url.replace(/^http:\/\//, 'https://');
    }
  }
  return '';
}

function mapRawToAmapPOI(p: AmapRawPOI): AmapPOI | null {
  const name = safeStr(p.name);
  if (!name) return null;

  const ext = parseBizExt(p.biz_ext);
  const openTime = safeStr(ext.open_time) || safeStr(ext.opentime);

  return {
    id: safeStr(p.id),
    name,
    type: safeStr(p.type),
    address: safeStr(p.address),
    location: safeStr(p.location),
    tel: safeStr(p.tel),
    rating: safeStr(ext.rating),
    cost: safeStr(ext.cost),
    openTime,
    cityName: safeStr(p.cityname),
    adName: safeStr(p.adname),
    photo: firstPhotoUrl(p.photos),
  };
}

function ratingSortKey(rating: string): number {
  const n = parseFloat(rating);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

function sortByRatingDesc(items: AmapPOI[]): AmapPOI[] {
  return [...items].sort((a, b) => ratingSortKey(b.rating) - ratingSortKey(a.rating));
}

async function fetchPlaceTextPage(params: {
  key: string;
  city: string;
  types?: string;
  keywords?: string;
  page: number;
  offset: number;
}): Promise<AmapRawPOI[]> {
  const search = new URLSearchParams({
    key: params.key,
    city: params.city.trim(),
    citylimit: 'true',
    offset: String(params.offset),
    page: String(params.page),
    extensions: 'all',
  });
  if (params.types?.trim()) search.set('types', params.types.trim());
  if (params.keywords?.trim()) search.set('keywords', params.keywords.trim());

  const url = `${AMAP_PLACE_TEXT}?${search.toString()}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as AmapPlaceTextResponse;
  if (data.status !== '1') {
    throw new Error(data.info || data.infocode || 'Amap API error');
  }
  return data.pois ?? [];
}

/** 高德并发/频率限制等可重试的瞬时错误 */
const RETRYABLE_AMAP_ERRORS = /CUQPS_HAS_EXCEEDED_THE_LIMIT|CUQPS|ENGINE_RESPONSE_DATA_ERROR|QPS/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 包一层重试：高德个人 key 有 QPS 限制，触发限速时退避后重试。 */
async function fetchPlaceTextPageWithRetry(
  params: Parameters<typeof fetchPlaceTextPage>[0],
  maxRetries = 2,
): Promise<AmapRawPOI[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchPlaceTextPage(params);
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || '');
      if (!RETRYABLE_AMAP_ERRORS.test(msg) || attempt === maxRetries) break;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Generic POI search (internal).
 * 高德要求 keywords 与 types 至少填其一；此处由调用方保证传入 types 或 keywords。
 */
async function searchPOI(params: {
  city: string;
  types?: string;
  keywords?: string;
  limit?: number;
}): Promise<AmapPOI[]> {
  const key = process.env.AMAP_KEY;
  if (!key?.trim()) {
    console.error('[amap-poi] AMAP_KEY is missing');
    return [];
  }

  const city = params.city?.trim();
  if (!city) {
    console.error('[amap-poi] city is empty');
    return [];
  }

  const types = params.types?.trim();
  const keywords = params.keywords?.trim();
  if (!types && !keywords) {
    console.error('[amap-poi] searchPOI requires types or keywords');
    return [];
  }

  const limit = params.limit ?? 10;
  const need = Math.max(1, Math.min(limit, 100));

  const mapped: AmapPOI[] = [];
  let page = 1;

  try {
    while (mapped.length < need) {
      const offset = Math.min(25, need - mapped.length);
      const rawList = await fetchPlaceTextPageWithRetry({
        key: key.trim(),
        city,
        types,
        keywords,
        page,
        offset,
      });

      if (rawList.length === 0) break;

      for (const raw of rawList) {
        const item = mapRawToAmapPOI(raw);
        if (item) mapped.push(item);
        if (mapped.length >= need) break;
      }

      if (rawList.length < offset) break;
      page += 1;
      if (page > 100) break;
    }
  } catch (e) {
    console.error('[amap-poi] search failed:', e);
    return [];
  }

  return mapped.slice(0, need);
}

export async function searchRestaurants(
  city: string,
  keyword?: string,
  limit?: number,
): Promise<AmapPOI[]> {
  const kw = keyword || '美食';
  const list = await searchPOI({
    city,
    types: TYPES_RESTAURANTS,
    keywords: kw,
    limit,
  });
  const filtered = list.filter(p => !p.type.includes('住宿') && !p.name.includes('宾馆'));
  return sortByRatingDesc(filtered);
}

export async function searchHotels(
  city: string,
  keyword?: string,
  limit?: number,
): Promise<AmapPOI[]> {
  const kw = keyword || '酒店';
  const list = await searchPOI({
    city,
    types: TYPES_HOTELS,
    keywords: kw,
    limit,
  });
  return sortByRatingDesc(list);
}

export async function searchAttractions(
  city: string,
  keyword?: string,
  limit?: number,
): Promise<AmapPOI[]> {
  const kw = keyword || '旅游景点';
  const results = await searchPOI({
    city,
    types: TYPES_ATTRACTIONS,
    keywords: kw,
    limit,
  });
  return sortByRatingDesc(results);
}

/**
 * 按具体名称在指定城市精确查找单个 POI（用于行程回填补图）。
 * 返回名称最匹配、且优先带图片的那一条。
 */
export async function searchPlaceByName(
  name: string,
  city: string,
): Promise<AmapPOI | null> {
  const kw = name.trim();
  if (!kw || !city.trim()) return null;
  const list = await searchPOI({ city, keywords: kw, limit: 5 });
  if (list.length === 0) return null;

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const target = norm(kw);

  // 1) 名称包含关系优先 2) 带图片优先 3) 高评分优先
  const scored = list
    .map((p) => {
      const pn = norm(p.name);
      let score = 0;
      if (pn === target) score += 100;
      else if (pn.includes(target) || target.includes(pn)) score += 60;
      if (p.photo) score += 20;
      score += ratingSortKey(p.rating) > 0 ? ratingSortKey(p.rating) : 0;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  // 名称完全不沾边就不强行返回，避免张冠李戴
  const best = scored[0];
  const bn = norm(best.p.name);
  if (bn !== target && !bn.includes(target) && !target.includes(bn) && best.score < 20) {
    return null;
  }
  return best.p;
}
