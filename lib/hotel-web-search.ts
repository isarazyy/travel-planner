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
  const t = setTimeout(() => controller.abort(), 12_000);
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

function formatResult(r: TavilyResult, idx: number): string {
  const title = (r.title || '无标题').slice(0, 120);
  const url = r.url || '';
  const content = (r.content || '').replace(/\s+/g, ' ').slice(0, 450);
  return `[${idx}] ${title}\n链接: ${url}\n摘要: ${content}`;
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

/**
 * 聚合与「住宿」相关的公开网页摘要，供大模型写入 pros/cons（需配置 TAVILY_API_KEY）。
 * 小红书/大众点评/美团无开放免费 API，此处通过通用网页检索贴近用户提到的来源。
 */
export async function buildHotelWebContextForPrompt(data: TripFormData): Promise<{
  contextText: string;
  used: boolean;
}> {
  if (!process.env.TAVILY_API_KEY?.trim()) {
    return { contextText: '', used: false };
  }

  try {
  const isFast = data.generationMode === 'fast';
  const dest =
    data.destinationMode === 'specific' && data.destinations?.length
      ? data.destinations.join(' ')
      : (data.destinationHint || '').trim() || '行程目的地';

  const dateHint =
    data.dateMode === 'fixed' && data.startDate && data.endDate
      ? `${data.startDate} 至 ${data.endDate}`
      : '日期待定';

  /** 分城检索，避免只得到笼统「多城民宿」而缺少具体店名 */
  const queries: string[] = [];
  if (data.destinationMode === 'specific' && data.destinations?.length) {
    const cities = data.destinations.slice(0, 4);
    for (const city of cities) {
      queries.push(
        `${city} 酒店 民宿 推荐 真实店名 评价 避雷 ${dateHint}`,
      );
    }
    if (!isFast && cities.length >= 1) {
      queries.push(`${dest} 住宿 连锁酒店 亚朵 全季 桔子 评价`);
    }
  }
  if (queries.length === 0) {
    queries.push(
      isFast
        ? `${dest} 酒店 民宿 推荐 大众点评 美团 评价 ${dateHint}`
        : `${dest} 酒店 民宿 推荐 真实评价 避雷 大众点评 ${dateHint}`,
    );
    if (!isFast) {
      queries.push(`${dest} 住宿 小红书 测评 优缺点 ${dateHint}`);
    }
  }

  const batch = await Promise.all(
    queries.map((q) => tavilySearch(`${q} ${dateHint}`, isFast ? 5 : 6))
  );
  const merged = dedupeByUrl(batch.flat());
  if (merged.length === 0) {
    return { contextText: '', used: false };
  }

  const maxChars = isFast ? 3600 : 6500;
  let out = '';
  let i = 0;
  for (const r of merged) {
    const block = formatResult(r, i + 1);
    if (out.length + block.length + 2 > maxChars) break;
    out += (out ? '\n\n' : '') + block;
    i++;
  }

  return { contextText: out, used: true };
  } catch (e) {
    console.error('[hotel-web-search] unexpected error:', e);
    return { contextText: '', used: false };
  }
}
