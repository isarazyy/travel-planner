/**
 * AI 生成方案后，扫描行程中的跨城交通活动，
 * 调用高德 transit API 获取真实车次信息并回填。
 * 高德无铁路数据时，用千问联网搜索兜底查车次。
 */
import { getTransitRoutes, formatTransitSummary, type TransitRoute } from './amap-transit';
import { callQwen } from './qwen';

const isDev = process.env.NODE_ENV === 'development';

interface TransportInfo {
  fromStation?: string;
  toStation?: string;
  trainNo?: string;
  departTime?: string;
  arriveTime?: string;
  duration?: string;
  priceNote?: string;
}

interface Activity {
  time?: string;
  activity?: string;
  location?: string;
  duration?: string;
  notes?: string;
  transportInfo?: TransportInfo;
  [key: string]: unknown;
}

interface DayPlan {
  day?: number;
  activities?: Activity[];
  [key: string]: unknown;
}

interface PlanData {
  itinerary?: DayPlan[];
  [key: string]: unknown;
}

const TRANSPORT_KEYWORDS = /高铁|火车|动车|列车|铁路|乘车前往|坐车前往|出发前往|乘坐.*前往|赶往|转乘/;
const FLIGHT_KEYWORDS = /飞机|航班|飞往|机场|航空|飞行/;

function extractCityFromStation(station: string): string {
  return station
    .replace(/(南站|北站|东站|西站|站)$/, '')
    .replace(/(火车站|高铁站|动车站)$/, '')
    .trim();
}

/**
 * From an activity that looks like inter-city transport,
 * extract the origin and destination city names.
 */
function extractCityPair(act: Activity): { fromCity: string; toCity: string } | null {
  const fromStn = act.transportInfo?.fromStation?.trim();
  const toStn = act.transportInfo?.toStation?.trim();
  if (fromStn && toStn) {
    return {
      fromCity: extractCityFromStation(fromStn),
      toCity: extractCityFromStation(toStn),
    };
  }

  const loc = act.location || '';
  const arrowMatch = loc.match(/^(.+?)[→➡>至到]\s*(.+?)$/);
  if (arrowMatch) {
    return {
      fromCity: extractCityFromStation(arrowMatch[1].trim()),
      toCity: extractCityFromStation(arrowMatch[2].trim()),
    };
  }

  const actText = act.activity || '';
  const destMatch = actText.match(/前往(.{2,6})/);
  if (destMatch) {
    const fromLoc = loc || '';
    const fromCity = fromLoc ? extractCityFromStation(fromLoc.split(/[→➡>至到,，]/)[0].trim()) : '';
    const toCity = extractCityFromStation(destMatch[1].trim());
    if (fromCity && toCity && fromCity !== toCity) {
      return { fromCity, toCity };
    }
  }

  return null;
}

function isFlightActivity(act: Activity): boolean {
  const text = `${act.activity || ''} ${act.notes || ''} ${act.location || ''}`;
  return FLIGHT_KEYWORDS.test(text);
}

function isTransportActivity(act: Activity): boolean {
  if (isFlightActivity(act)) return false;
  const text = `${act.activity || ''} ${act.notes || ''} ${act.location || ''}`;
  return TRANSPORT_KEYWORDS.test(text) || !!(act.transportInfo?.fromStation && act.transportInfo?.toStation);
}

function pickBestRailwayRoute(routes: TransitRoute[], requireRailway: boolean): TransitRoute | null {
  const withRailway = routes.filter(r =>
    r.segments.some(s => s.type === 'railway')
  );
  if (withRailway.length > 0) {
    return withRailway.sort((a, b) => a.totalDuration - b.totalDuration)[0];
  }
  if (requireRailway) return null;
  return routes.length > 0 ? routes[0] : null;
}

function formatDurationCn(totalSec: number): string {
  if (totalSec <= 0) return '约0分钟';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0 && m > 0) return `约${h}小时${m}分钟`;
  if (h > 0) return `约${h}小时`;
  return `约${m}分钟`;
}

/**
 * Enrich a single plan's transport activities with real Amap data.
 */
async function enrichPlanTransit(plan: PlanData): Promise<number> {
  const itinerary = plan.itinerary;
  if (!Array.isArray(itinerary)) return 0;

  const tasks: Array<{ act: Activity; fromCity: string; toCity: string; mentionsRail: boolean }> = [];

  for (const day of itinerary) {
    if (!Array.isArray(day.activities)) continue;
    for (const act of day.activities) {
      if (!isTransportActivity(act)) continue;
      const pair = extractCityPair(act);
      if (!pair) continue;
      if (pair.fromCity.length < 2 || pair.toCity.length < 2) continue;
      const actText = `${act.activity || ''} ${act.notes || ''}`;
      const mentionsRail = /高铁|动车|火车|列车|铁路/.test(actText);
      tasks.push({ act, ...pair, mentionsRail });
    }
  }

  if (tasks.length === 0) return 0;

  const cacheKey = (a: string, b: string) => `${a}→${b}`;
  const cache = new Map<string, TransitRoute[] | null>();

  const uniquePairs = [...new Set(tasks.map(t => cacheKey(t.fromCity, t.toCity)))];

  await Promise.allSettled(
    uniquePairs.map(async (key) => {
      const [from, to] = key.split('→');
      try {
        let routes = await getTransitRoutes(from, to, { maxRoutes: 3 });
        const hasRail = routes.some(r => r.segments.some(s => s.type === 'railway'));
        if (!hasRail) {
          isDev && console.log(`[post-enrich] ${from}→${to}: 无铁路方案，尝试加"市"重查`);
          const altRoutes = await getTransitRoutes(from + '市', to + '市', { maxRoutes: 3 });
          if (altRoutes.some(r => r.segments.some(s => s.type === 'railway'))) {
            routes = altRoutes;
          }
        }
        cache.set(key, routes.length > 0 ? routes : null);
        const railCount = routes.filter(r => r.segments.some(s => s.type === 'railway')).length;
        isDev && console.log(`[post-enrich] ${from}→${to}: ${routes.length}条方案（含铁路${railCount}条）`);
      } catch (e) {
        console.error(`[post-enrich] ${from}→${to} 查询失败:`, e);
        cache.set(key, null);
      }
    })
  );

  let enriched = 0;

  // Collect tasks needing Qwen train search, then run in parallel (max 3)
  const qwenSearchTasks: { act: any; fromCity: string; toCity: string }[] = [];

  for (const { act, fromCity, toCity, mentionsRail } of tasks) {
    const routes = cache.get(cacheKey(fromCity, toCity));
    if (!routes || routes.length === 0) continue;

    const best = pickBestRailwayRoute(routes, mentionsRail);
    if (!best) {
      if (mentionsRail && qwenSearchTasks.length < 3) {
        qwenSearchTasks.push({ act, fromCity, toCity });
      }
      continue;
    }

    const railSeg = best.segments.find(s => s.type === 'railway');

    if (!act.transportInfo) {
      act.transportInfo = {};
    }

    if (railSeg) {
      if (railSeg.lineName) {
        const trainNoMatch = railSeg.lineName.match(/[GDCKTZ]\d{1,5}/);
        act.transportInfo.trainNo = trainNoMatch ? trainNoMatch[0] : railSeg.lineName;
      }
      if (railSeg.departureStop) act.transportInfo.fromStation = railSeg.departureStop;
      if (railSeg.arrivalStop) act.transportInfo.toStation = railSeg.arrivalStop;
      if (railSeg.duration && railSeg.duration > 0) {
        act.transportInfo.duration = formatDurationCn(railSeg.duration);
        act.duration = formatDurationCn(railSeg.duration);
      }
    } else if (best.totalDuration > 0) {
      act.duration = formatDurationCn(best.totalDuration);
    }

    if (best.totalCost > 0) {
      act.transportInfo.priceNote = `约¥${Math.round(best.totalCost)}`;
    }

    const fromStn = act.transportInfo.fromStation || fromCity;
    const toStn = act.transportInfo.toStation || toCity;
    act.location = `${fromStn}→${toStn}`;
    cleanTransportNotes(act);

    enriched++;
  }

  // Run Qwen train searches in parallel (capped at 3)
  if (qwenSearchTasks.length > 0) {
    const qResults = await Promise.allSettled(
      qwenSearchTasks.map(({ fromCity, toCity, act }) =>
        qwenSearchTrains(
          fromCity, toCity,
          act.transportInfo?.fromStation,
          act.transportInfo?.toStation,
        ).then(qResult => ({ act, fromCity, toCity, qResult }))
      )
    );
    for (const r of qResults) {
      if (r.status !== 'fulfilled' || !r.value.qResult) {
        if (r.status === 'fulfilled') {
          isDev && console.log(`[post-enrich] ${r.value.fromCity}→${r.value.toCity}: 千问搜索无结果，保留AI原始数据`);
        }
        continue;
      }
      const { act, fromCity, toCity, qResult } = r.value;
      if (!act.transportInfo) act.transportInfo = {};
      act.transportInfo.trainNo = qResult.trainNo;
      if (qResult.fromStation) act.transportInfo.fromStation = qResult.fromStation;
      if (qResult.toStation) act.transportInfo.toStation = qResult.toStation;
      if (qResult.duration) {
        act.transportInfo.duration = qResult.duration;
        act.duration = qResult.duration;
      }
      if (qResult.price) act.transportInfo.priceNote = qResult.price;
      const fStn = act.transportInfo.fromStation || fromCity;
      const tStn = act.transportInfo.toStation || toCity;
      act.location = `${fStn}→${tStn}`;
      cleanTransportNotes(act);
      enriched++;
    }
  }

  return enriched;
}

function cleanTransportNotes(act: Activity) {
  if (act.notes?.includes('12306')) {
    act.notes = act.notes
      .replace(/建议提前在12306查询车次并购票/g, '')
      .replace(/请在12306查询具体车次与票价/g, '')
      .trim() || undefined;
  }
}

// ─── Qwen web search fallback for routes Amap can't cover ───

interface TrainSearchResult {
  trainNo: string;
  fromStation: string;
  toStation: string;
  duration?: string;
  price?: string;
}

const VALID_TRAIN_NO = /^[GDCKTZ]\d{1,5}$/;

function parseTrainResults(text: string): TrainSearchResult[] {
  const results: TrainSearchResult[] = [];

  // Split into blocks per train (double newline or by train number pattern)
  const blocks = text.split(/\n\s*\n|\n(?=车次|[GDCKTZ]\d{1,5})/).filter(b => b.trim());

  for (const block of blocks) {
    const noMatch = block.match(/([GDCKTZ]\d{1,5})/);
    if (!noMatch) continue;
    const trainNo = noMatch[1];
    if (!VALID_TRAIN_NO.test(trainNo)) continue;
    if (results.some(r => r.trainNo === trainNo)) continue;

    const fullText = block.replace(/\n/g, ' ');

    // Station extraction — multi-line "出发站：XXX站" or single-line "XXX站→YYY站"
    let fromStation = '';
    let toStation = '';
    const fromMatch = block.match(/出发站[：:]\s*(\S{2,10})/);
    const toMatch = block.match(/(?:到达站|终点站|到站)[：:]\s*(\S{2,10})/);
    if (fromMatch) fromStation = fromMatch[1].trim();
    if (toMatch) toStation = toMatch[1].trim();
    if (!fromStation || !toStation) {
      const arrowMatch = fullText.match(/(\S{2,8}[站])\s*[→\-—至到]\s*(\S{2,8}[站])/);
      if (arrowMatch) {
        if (!fromStation) fromStation = arrowMatch[1];
        if (!toStation) toStation = arrowMatch[2];
      }
    }

    // Duration — "0.72小时" or "约1小时20分钟" or "43分钟"
    let duration: string | undefined;
    const decimalHourMatch = fullText.match(/(\d+\.\d+)\s*小时/);
    if (decimalHourMatch) {
      const totalMin = Math.round(parseFloat(decimalHourMatch[1]) * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      duration = h > 0 && m > 0 ? `约${h}小时${m}分钟` : h > 0 ? `约${h}小时` : `约${m}分钟`;
    } else {
      const hmMatch = fullText.match(/(\d+)\s*(?:小时|h)\s*(\d+)?\s*(?:分钟?|min)?/i);
      if (hmMatch) {
        const h = parseInt(hmMatch[1]);
        const m = hmMatch[2] ? parseInt(hmMatch[2]) : 0;
        duration = h > 0 && m > 0 ? `约${h}小时${m}分钟` : h > 0 ? `约${h}小时` : `约${m}分钟`;
      } else {
        const minMatch = fullText.match(/(\d+)\s*分钟/);
        if (minMatch) duration = `约${minMatch[1]}分钟`;
      }
    }

    // Price
    const priceMatch = fullText.match(/[¥￥]\s*(\d{2,4}(?:\.\d{1,2})?)/);
    const price = priceMatch ? `约¥${priceMatch[1]}` : undefined;

    results.push({ trainNo, fromStation, toStation, duration, price });
    if (results.length >= 3) break;
  }

  return results;
}

async function qwenSearchTrains(
  fromCity: string,
  toCity: string,
  fromStation?: string,
  toStation?: string,
): Promise<TrainSearchResult | null> {
  try {
    const stationHint = fromStation && toStation
      ? `（出发站${fromStation}，到达站${toStation}）`
      : '';
    const prompt = `请搜索${fromCity}到${toCity}${stationHint}的高铁/动车车次信息。
只需要告诉我：车次号、出发站、到达站、大约运行时间、二等座大约票价。
列出1-2个最常见的车次即可，用简洁格式回答。`;

    isDev && console.log(`[qwen-train] 搜索 ${fromCity}→${toCity} 车次...`);
    const raw = await callQwen(prompt, {
      maxTokens: 300,
      temperature: 0.1,
      timeoutMs: 15000,
      model: 'qwen-turbo',
      enableSearch: true,
    });

    isDev && console.log(`[qwen-train] ${fromCity}→${toCity} 返回: ${raw.slice(0, 120)}...`);
    const results = parseTrainResults(raw);
    if (results.length > 0) {
      isDev && console.log(`[qwen-train] 解析到 ${results.length} 条车次: ${results.map(r => r.trainNo).join(', ')}`);
      return results[0];
    }
    isDev && console.log(`[qwen-train] 未能从结果中解析出有效车次`);
    return null;
  } catch (e) {
    console.error(`[qwen-train] ${fromCity}→${toCity} 搜索失败:`, e);
    return null;
  }
}

// ─── Main export ───

/**
 * Post-process AI-generated result: enrich transport sections with real Amap data.
 * Handles both single plan and multi-plan (plans array) structures.
 */
export async function postEnrichTransitData(result: Record<string, unknown>): Promise<void> {
  const start = Date.now();

  const plans: PlanData[] = [];

  if (Array.isArray(result.plans)) {
    for (const p of result.plans) {
      if (p && typeof p === 'object') plans.push(p as PlanData);
    }
  } else if (Array.isArray(result.itinerary)) {
    plans.push(result as unknown as PlanData);
  }

  if (plans.length === 0) {
    isDev && console.log('[post-enrich] 未找到可处理的行程数据');
    return;
  }

  let totalEnriched = 0;
  for (const plan of plans) {
    const n = await enrichPlanTransit(plan);
    totalEnriched += n;
  }

  const elapsed = Date.now() - start;
  isDev && console.log(`[post-enrich] 完成，共填充 ${totalEnriched} 条交通信息，耗时 ${elapsed}ms`);
}
