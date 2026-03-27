export async function callQwen(
  prompt: string,
  options?: { maxTokens?: number; temperature?: number; timeoutMs?: number; model?: string }
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error('DASHSCOPE_API_KEY not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 70000);

  let res: Response;
  try {
    res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options?.model ?? 'qwen-plus',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的旅行规划师。你必须严格按照用户要求的JSON格式返回结果，不要添加任何额外的文字说明、markdown标记或代码块标记。只返回纯JSON。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: options?.temperature ?? 0.4,
        max_tokens: options?.maxTokens ?? 3200,
      }),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('AI 生成超时，请重试');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Qwen API error ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from Qwen');
  return content;
}

export function parseJsonResponse(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const fillMissingValues = (s: string) =>
      s
        // e.g. "notes":}  -> "notes":null}
        .replace(/:\s*([}\]])/g, ': null$1')
        // e.g. "notes":,  -> "notes": null,
        .replace(/:\s*,/g, ': null,');
    const normalizeObjectKeys = (s: string) =>
      s
        // e.g. { plans: ... } -> { "plans": ... }
        .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
        // e.g. {"plans" ...} -> {"plans": ...}
        .replace(/("?[A-Za-z_][A-Za-z0-9_]*"?)(\s+)(?=[{\["0-9tfn-])/g, '$1: ');
    const trimTrailingGarbage = (s: string) => {
      const lastBrace = s.lastIndexOf('}');
      const lastBracket = s.lastIndexOf(']');
      const cut = Math.max(lastBrace, lastBracket);
      return cut >= 0 ? s.slice(0, cut + 1) : s;
    };
    const attemptParse = (s: string) => {
      let candidate = s;
      candidate = fillMissingValues(candidate);
      candidate = normalizeObjectKeys(candidate);
      candidate = candidate.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(candidate);
    };

    // Fallback: recover truncated/near-valid JSON from model output
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
    cleaned = fillMissingValues(cleaned);

    // Remove trailing commas before closing tokens
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // Auto-close unbalanced braces/brackets (common when output is truncated)
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' || ch === ']') {
        const last = stack[stack.length - 1];
        if ((ch === '}' && last === '{') || (ch === ']' && last === '[')) {
          stack.pop();
        }
      }
    }

    if (inString) cleaned += '"';
    while (stack.length) {
      const opener = stack.pop();
      cleaned += opener === '{' ? '}' : ']';
    }

    cleaned = fillMissingValues(cleaned);
    cleaned = normalizeObjectKeys(cleaned);
    cleaned = trimTrailingGarbage(cleaned);

    try {
      return attemptParse(cleaned);
    } catch (e: any) {
      // Targeted patch using parser-reported position:
      // fix cases like `"foo" "bar"` / `"foo", "bar"` where colon is missing
      const m = String(e?.message || '').match(/position (\d+)/);
      const pos = m ? Number(m[1]) : -1;
      if (Number.isFinite(pos) && pos > 1 && pos < cleaned.length - 1) {
        const before = cleaned.slice(0, pos);
        const after = cleaned.slice(pos);
        const lastQuote = before.lastIndexOf('"');
        const prevQuote = before.lastIndexOf('"', lastQuote - 1);
        if (lastQuote > 0 && prevQuote >= 0) {
          const between = before.slice(lastQuote + 1);
          if (/^\s*,?\s*$/.test(between)) {
            cleaned = `${before.slice(0, lastQuote + 1)}:${after}`;
          }
        }
      }
      return attemptParse(cleaned);
    }
  }
}
