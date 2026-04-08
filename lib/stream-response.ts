/**
 * SSE streaming helper — keeps long-running API responses alive so reverse
 * proxies with short idle timeouts don't drop the connection while we wait for the LLM.
 *
 * Protocol:
 *   event: ping\ndata: {}\n\n          ← heartbeat every PING_INTERVAL_MS
 *   event: result\ndata: <json>\n\n    ← final payload
 *   event: error\ndata: <json>\n\n     ← on failure
 */

const PING_INTERVAL_MS = 15_000;

function sseChunk(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

/**
 * Wrap an async task in an SSE stream that sends keep-alive pings until
 * the task resolves or rejects.
 */
export function streamWithKeepAlive<T>(
  task: () => Promise<T>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseChunk('ping', '{}')));
        } catch {
          /* stream already closed */
        }
      }, PING_INTERVAL_MS);

      try {
        const result = await task();
        clearInterval(pingTimer);
        controller.enqueue(
          encoder.encode(sseChunk('result', JSON.stringify(result))),
        );
      } catch (err: any) {
        clearInterval(pingTimer);
        const raw = String(err?.message || '生成失败');
        let friendly = raw;
        if (/position \d+|JSON|Unexpected token|Expected/.test(raw)) {
          friendly = 'AI 返回的数据不完整，请重试一次（建议选择"极速"模式）';
        } else if (/超时|timeout|Abort/i.test(raw)) {
          friendly = '生成时间较长导致超时，请重试';
        } else if (/API error 4/i.test(raw)) {
          friendly = 'AI 服务调用失败，请检查额度或稍后重试';
        }
        const payload = { error: friendly };
        controller.enqueue(
          encoder.encode(sseChunk('error', JSON.stringify(payload))),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
