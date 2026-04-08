export type RoutePointKind = 'departure' | 'destination' | 'activity';

export interface RoutePointLabel {
  label: string;
  kind: RoutePointKind;
}

function normKey(s: string): string {
  return s.replace(/\s/g, '').toLowerCase();
}

/** 将 destinations 里「南昌、景德镇」这类合并项拆成多个城市，避免整条串参与匹配/编码只出一个点 */
function expandDestinationsList(raw: string[]): string[] {
  const out: string[] = [];
  for (const d of raw) {
    const t = String(d).trim();
    if (!t) continue;
    if (/[、,，]/.test(t)) {
      for (const part of t.split(/[、,，]/).map((x) => x.trim()).filter(Boolean)) {
        out.push(part);
      }
    } else {
      out.push(t);
    }
  }
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const x of out) {
    const k = normKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(x);
  }
  return deduped;
}

/** 从「智能规划顺序」等文案中按箭头拆成片段（不含每日 POI） */
export function parseOrderedStopsFromRouteText(route: string | undefined | null): string[] {
  if (!route?.trim()) return [];
  let s = route.trim();
  s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
  const hasArrow = /[→>⇒➡]|->|=>/.test(s);
  const hasDashList = /\s[-–—]\s/.test(s);
  const rawParts = hasArrow
    ? s.split(/[→>⇒➡]|->|=>/g)
    : hasDashList
      ? s.split(/\s[-–—]\s/g)
      : s.split(/[、,，]/g);
  const parts = rawParts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const first = p.split(/[，,、]/)[0].trim();
      return first.replace(/^(先到|再到|然后|最后|建议|全程|先)/, '').trim();
    })
    .filter((p) => p.length >= 2 && p.length <= 32);
  return parts;
}

function isDepartureSegment(segment: string, departure: string): boolean {
  const a = normKey(segment);
  const b = normKey(departure);
  if (!a || !b) return false;
  /** 不要用前两字相等判断，易把无关地名误判为出发地 */
  return a === b || a.includes(b) || b.includes(a);
}

/** 将文案片段与用户填写的目的地对齐，避免误用无关地名 */
function matchDestinationCanonical(segment: string, destinations: string[]): string | null {
  const seg = segment.trim();
  if (!seg) return null;
  const nk = normKey(seg);
  for (const d of destinations) {
    const dk = normKey(d);
    if (nk === dk || nk.includes(dk) || dk.includes(nk) || seg.includes(d) || d.includes(seg)) {
      return d;
    }
  }
  return null;
}

/**
 * **走廊地图**：只包含「出发地 + 用户目的地」，顺序优先采用 recommendedRoute 里的箭头顺序；
 * 不把 itinerary 里每条活动的 location 标上地图（否则 POI/短地名会误编码到全国各地，连线混乱）。
 */
export function collectCorridorRouteLabels(input: {
  departure: string;
  destinations: string[];
  /** 仅数据库旧数据：只有 destination 文本、destinations 为空时拆分 */
  destinationSummary?: string | null;
  recommendedRoute?: string | null;
}): RoutePointLabel[] {
  const dep = input.departure.replace(/\s+/g, ' ').trim();
  let dests = (input.destinations || []).map((d) => String(d).trim()).filter(Boolean);
  if (dests.length === 0 && input.destinationSummary?.trim()) {
    dests = input.destinationSummary
      .split(/[、,，]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  dests = expandDestinationsList(dests);

  const out: RoutePointLabel[] = [];
  const seenDest = new Set<string>();

  const pushDest = (label: string) => {
    const k = normKey(label);
    if (seenDest.has(k)) return;
    seenDest.add(k);
    out.push({ label, kind: 'destination' as const });
  };

  if (dep.length >= 2) {
    out.push({ label: dep, kind: 'departure' });
  }

  const segments = parseOrderedStopsFromRouteText(input.recommendedRoute ?? undefined);

  for (const seg of segments) {
    if (isDepartureSegment(seg, dep)) continue;
    const canon = matchDestinationCanonical(seg, dests);
    if (canon) pushDest(canon);
  }

  for (const d of dests) {
    if (!seenDest.has(normKey(d))) pushDest(d);
  }

  /** 主题/开放模式未存 destinations 时，至少用推荐路线里的城市做走廊 */
  if (dests.length === 0) {
    for (const seg of segments) {
      if (isDepartureSegment(seg, dep)) continue;
      const t = seg.trim();
      if (t.length >= 2 && t.length <= 24) pushDest(t);
    }
  }

  return out.slice(0, 20);
}

export interface ActivityPoiLabel {
  label: string;
  cityHint?: string;
}

function extractCityFromDayTheme(theme?: string): string | undefined {
  if (!theme) return undefined;
  const match = theme.match(/([\u4e00-\u9fa5]{2,4})(一日游|半日游|深度游|游玩|探索|漫步|之旅|市区|古城|老城)/);
  if (match) return match[1];
  const arriveMatch = theme.match(/(?:抵达|到达|前往|游览)([\u4e00-\u9fa5]{2,4})/);
  if (arriveMatch) return arriveMatch[1];
  return undefined;
}

/**
 * 每日活动里的 location（POI），供「第二层」可选展示；排除与走廊点重复的地名。
 * 每个 POI 带上当天所在城市的上下文，避免跨省同名景点误定位。
 */
export function collectActivityPoiLabels(input: {
  departure: string;
  destinations: string[];
  itinerary: Array<{ theme?: string; activities?: Array<{ location?: string }> }>;
  /** 走廊上的点，避免与主序号重复 */
  corridor: RoutePointLabel[];
}): ActivityPoiLabel[] {
  const dep = normKey(input.departure);
  const destKeys = new Set((input.destinations || []).map((d) => normKey(String(d))));
  const seen = new Set<string>(input.corridor.map((c) => normKey(c.label)));
  const out: ActivityPoiLabel[] = [];

  const maybePush = (raw: string, cityHint?: string) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t.length < 2) return;
    const k = normKey(t);
    if (seen.has(k)) return;
    if (k === dep || destKeys.has(k)) return;
    seen.add(k);
    out.push({ label: t, cityHint });
  };

  for (const day of input.itinerary || []) {
    const dayCityHint = extractCityFromDayTheme((day as { theme?: string }).theme);
    for (const act of day.activities || []) {
      const loc = act?.location;
      if (typeof loc === 'string') maybePush(loc, dayCityHint);
    }
  }

  return out.slice(0, 36);
}

/** @deprecated 会把大量每日 activity.location 标上地图，易产生跨省误点；请使用 collectCorridorRouteLabels */
export function collectRoutePointLabels(input: {
  departure: string;
  destinations: string[];
  itinerary: Array<{ activities?: Array<{ location?: string }> }>;
}): RoutePointLabel[] {
  const out: RoutePointLabel[] = [];
  const seen = new Set<string>();

  const push = (raw: string, kind: RoutePointKind) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: t, kind });
  };

  push(input.departure, 'departure');
  for (const d of input.destinations || []) {
    if (typeof d === 'string') push(d, 'destination');
  }
  for (const day of input.itinerary || []) {
    for (const act of day.activities || []) {
      const loc = act?.location;
      if (typeof loc === 'string') push(loc, 'activity');
    }
  }

  return out.slice(0, 36);
}
