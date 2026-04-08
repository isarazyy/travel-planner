import type { TripFormData } from './types';

type TavilyResult = { title?: string; url?: string; content?: string };

function normalizeTavilyKey(raw: string): string {
  const k = raw.trim();
  if (!k) return '';
  return k.startsWith('tvly-') ? k : `tvly-${k}`;
}

async function tavilySearch(query: string, maxResults: number): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizeTavilyKey(apiKey)}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: maxResults,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

function dedupeByUrl(items: TavilyResult[]): TavilyResult[] {
  const seen = new Set<string>();
  const out: TavilyResult[] = [];
  for (const r of items) {
    const u = (r.url || '').split('#')[0];
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(r);
  }
  return out;
}

function formatResult(r: TavilyResult, idx: number): string {
  const title = (r.title || '无标题').slice(0, 120);
  const url = r.url || '';
  const content = (r.content || '').replace(/\s+/g, ' ').slice(0, 380);
  return `[${idx}] ${title}\n链接: ${url}\n摘要: ${content}`;
}

function resolveCities(data: TripFormData): string[] {
  if (data.destinations?.length) {
    const chunks = data.destinations
      .flatMap((d) => String(d).split(/[、,，]/g))
      .map((x) => x.trim())
      .filter(Boolean);
    return [...new Set(chunks)].slice(0, 4);
  }
  const hint = data.destinationHint?.trim();
  if (hint) return [hint];
  return [data.departure];
}

export async function buildTransportFoodWebContextForPrompt(data: TripFormData): Promise<{
  contextText: string;
  used: boolean;
}> {
  if (!process.env.TAVILY_API_KEY?.trim()) return { contextText: '', used: false };
  const cities = resolveCities(data);
  const isFast = data.generationMode === 'fast';
  const dateHint =
    data.dateMode === 'fixed' && data.startDate && data.endDate
      ? `${data.startDate} 至 ${data.endDate}`
      : '近期';

  const queries: string[] = [];
  for (const city of cities) {
    queries.push(`${city} 大众点评 高分 餐厅 推荐 招牌菜 ${dateHint}`);
    if (!isFast) queries.push(`${city} 必吃 口碑餐厅 评价 ${dateHint}`);
  }
  if (cities.length >= 2) {
    queries.push(`${cities[0]} 到 ${cities[1]} 高铁 主要经停 大致耗时 12306 查询 ${dateHint}`);
    /** 京张等常见线：避免模型误写「北京西」 */
    if (/北京/.test(cities[0]) && /张家口/.test(cities[1])) {
      queries.push('北京清河站 北京北站 到 张家口 高铁 12306');
    }
  } else {
    queries.push(`${cities[0]} 城市交通 枢纽站 高铁站 ${dateHint}`);
  }

  try {
    const batch = await Promise.all(queries.map((q) => tavilySearch(q, isFast ? 3 : 4)));
    const merged = dedupeByUrl(batch.flat());
    if (!merged.length) return { contextText: '', used: false };

    let out = '';
    const maxChars = isFast ? 2600 : 4200;
    for (let i = 0; i < merged.length; i++) {
      const block = formatResult(merged[i], i + 1);
      if (out.length + block.length + 2 > maxChars) break;
      out += (out ? '\n\n' : '') + block;
    }
    return { contextText: out, used: !!out };
  } catch (e) {
    console.error('[trip-web-search] unexpected error:', e);
    return { contextText: '', used: false };
  }
}
