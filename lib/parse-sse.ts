/**
 * Parse an SSE stream from our API into the final result or throw on error.
 * Handles three event types: ping (ignored), result (success), error (throws).
 */
export async function parseSSEResponse<T = any>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';

  // If the response is plain JSON (e.g. validation errors), parse directly
  if (contentType.includes('application/json')) {
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || '请求失败');
    return json as T;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;
  let errorMsg: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    // Parse complete SSE blocks from the buffer
    const blocks = buffer.split('\n\n');
    // Keep the last (potentially incomplete) block in the buffer
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      if (!block.trim()) continue;
      let event = '';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (event === 'ping') continue;
      if (event === 'result') {
        result = JSON.parse(data) as T;
      } else if (event === 'error') {
        const parsed = JSON.parse(data);
        errorMsg = parsed.error || '生成失败';
      }
    }

    if (done) break;
  }

  if (errorMsg) throw new Error(errorMsg);
  if (result === undefined) throw new Error('未收到有效响应');
  return result;
}
