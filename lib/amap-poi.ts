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
}

type BizExt = {
  rating?: string;
  cost?: string;
  open_time?: string;
  opentime?: string;
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
      const rawList = await fetchPlaceTextPage({
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
