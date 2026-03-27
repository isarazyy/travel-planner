/**
 * SSE streaming helper — keeps long-running API responses alive so reverse
 * proxies (Cloudflare tunnel, ngrok …) don't 524 while we wait for the LLM.
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
        const payload = { error: err?.message || '生成失败' };
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
