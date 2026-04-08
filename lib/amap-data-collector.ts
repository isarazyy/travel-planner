/**
 * 根据行程涉及的城市，批量从高德采集真实 POI + 交通数据，
 * 组装成可直接嵌入 prompt 的文本块。
 */
import type { TripFormData } from './types';
import { searchRestaurants, searchHotels, searchAttractions, type AmapPOI } from './amap-poi';
import { getTransitRoutes, formatTransitSummary } from './amap-transit';

const isDev = process.env.NODE_ENV === 'development';

export interface CollectedRealData {
  restaurants: Record<string, AmapPOI[]>;
  hotels: Record<string, AmapPOI[]>;
  attractions: Record<string, AmapPOI[]>;
  transitRoutes: { from: string; to: string; summary: string }[];
  promptText: string;
}

function resolveCities(data: TripFormData): string[] {
  const set = new Set<string>();
  if (data.departure?.trim()) set.add(data.departure.trim());
  for (const d of data.destinations || []) {
    const parts = d.split(/[、,，]/);
    for (const p of parts) {
      const t = p.trim();
      if (t) set.add(t);
    }
  }
  if (data.destinationHint?.trim()) {
    for (const p of data.destinationHint.split(/[、,，\s]+/)) {
      const t = p.trim();
      if (t && t.length >= 2 && t.length <= 10) set.add(t);
    }
  }
  return [...set];
}

function formatPOI(poi: AmapPOI, idx: number): string {
  const parts = [`${idx + 1}. ${poi.name}`];
  if (poi.rating && poi.rating !== '0') parts.push(`评分${poi.rating}`);
  if (poi.cost && poi.cost !== '0' && poi.cost !== '0.00') parts.push(`人均¥${Math.round(parseFloat(poi.cost))}`);
  if (poi.address) parts.push(poi.address);
  if (poi.tel && poi.tel !== '[]') parts.push(`电话:${poi.tel}`);
  if (poi.openTime && poi.openTime !== '[]') parts.push(`营业:${poi.openTime.slice(0, 60)}`);
  return parts.join(' | ');
}

function formatAttractionPOI(poi: AmapPOI, idx: number): string {
  const parts = [`${idx + 1}. ${poi.name}`];
  if (poi.rating && poi.rating !== '0') parts.push(`评分${poi.rating}`);
  if (poi.type) parts.push(poi.type.split(';').pop() || '');
  if (poi.address) parts.push(poi.address);
  return parts.join(' | ');
}

export async function collectRealDataForTrip(data: TripFormData): Promise<CollectedRealData> {
  const cities = resolveCities(data);
  isDev && console.log('[amap-collector] 解析到城市列表:', cities);
  const isFast = data.generationMode === 'fast';
  const poiLimit = isFast ? 6 : 10;

  const restaurants: Record<string, AmapPOI[]> = {};
  const hotels: Record<string, AmapPOI[]> = {};
  const attractions: Record<string, AmapPOI[]> = {};
  const transitRoutes: { from: string; to: string; summary: string }[] = [];

  const destCities = cities.filter(c => c !== data.departure?.trim());
  isDev && console.log('[amap-collector] 目的地城市:', destCities, '出发地:', data.departure);

  const styleToKeyword: Record<string, string> = {
    designer: '设计酒店',
    boutique_bnb: '精品民宿',
    scenic_view: '景观酒店',
    cultural: '文化主题酒店',
    resort: '度假村 温泉',
    treehouse_cave: '特色民宿',
    pet_friendly: '宠物友好酒店',
  };
  const accomStyles = data.preferences?.accommodationStyles?.filter(s => s && s !== 'no_preference') ?? [];
  const hotelKeyword = accomStyles.length > 0
    ? accomStyles.map(s => styleToKeyword[s]).filter(Boolean).join(' ')
    : undefined;

  const poiTasks = destCities.flatMap(city => [
    searchRestaurants(city, undefined, poiLimit)
      .then(r => { restaurants[city] = r; isDev && console.log(`[amap-collector] ${city} 餐厅: ${r.length}条`); })
      .catch(e => { console.error(`[amap-collector] ${city} 餐厅查询失败:`, e); }),
    searchHotels(city, hotelKeyword, poiLimit)
      .then(r => { hotels[city] = r; isDev && console.log(`[amap-collector] ${city} 酒店: ${r.length}条`); })
      .catch(e => { console.error(`[amap-collector] ${city} 酒店查询失败:`, e); }),
    searchAttractions(city, undefined, poiLimit)
      .then(r => { attractions[city] = r; isDev && console.log(`[amap-collector] ${city} 景点: ${r.length}条`); })
      .catch(e => { console.error(`[amap-collector] ${city} 景点查询失败:`, e); }),
  ]);

  const transitPairs: [string, string][] = [];
  if (cities.length >= 2) {
    for (let i = 0; i < cities.length - 1; i++) {
      transitPairs.push([cities[i], cities[i + 1]]);
    }
    if (cities.length > 2 && cities[cities.length - 1] !== cities[0]) {
      transitPairs.push([cities[cities.length - 1], cities[0]]);
    }
  }
  isDev && console.log('[amap-collector] 交通路线对:', transitPairs);

  const transitTasks = transitPairs.map(([from, to]) =>
    getTransitRoutes(from, to, { maxRoutes: 2 })
      .then(routes => {
        isDev && console.log(`[amap-collector] ${from}→${to} 交通方案: ${routes.length}条`);
        if (routes.length > 0) {
          const summary = routes.map((r, i) => `方案${i + 1}: ${formatTransitSummary(r)}`).join('\n');
          transitRoutes.push({ from, to, summary });
        }
      })
      .catch(e => { console.error(`[amap-collector] ${from}→${to} 交通查询失败:`, e); })
  );

  const allResults = await Promise.allSettled([...poiTasks, ...transitTasks]);
  const rejected = allResults.filter(r => r.status === 'rejected');
  if (rejected.length > 0) {
    console.warn(`[amap-collector] ${rejected.length}/${allResults.length} 任务被拒绝`);
  }

  // Build prompt text
  let promptText = '';

  for (const city of destCities) {
    const cityBlock: string[] = [];
    cityBlock.push(`\n## ${city}`);

    const rest = restaurants[city] || [];
    if (rest.length > 0) {
      cityBlock.push(`\n### 高分餐厅（高德真实数据）`);
      rest.forEach((p, i) => cityBlock.push(formatPOI(p, i)));
    }

    const htl = hotels[city] || [];
    if (htl.length > 0) {
      cityBlock.push(`\n### 住宿推荐（高德真实数据）`);
      htl.forEach((p, i) => cityBlock.push(formatPOI(p, i)));
    }

    const att = attractions[city] || [];
    if (att.length > 0) {
      cityBlock.push(`\n### 景点/体验（高德真实数据）`);
      att.forEach((p, i) => cityBlock.push(formatAttractionPOI(p, i)));
    }

    if (cityBlock.length > 1) {
      promptText += cityBlock.join('\n');
    }
  }

  if (transitRoutes.length > 0) {
    promptText += '\n\n## 城市间交通方案（高德实时路线规划）';
    for (const tr of transitRoutes) {
      promptText += `\n\n### ${tr.from} → ${tr.to}\n${tr.summary}`;
    }
  }

  return { restaurants, hotels, attractions, transitRoutes, promptText };
}
