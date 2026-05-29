import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import autocannon from 'autocannon';
import { IncomingMessage } from 'http';

// Run autocannon dengan promise
function runLoadTest(params: {
  url: string;
  connections: number;
  duration: number;
  pipelining: number;
  workers: number;
}) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: params.url,
        connections: params.connections,
        duration: params.duration,
        pipelining: params.pipelining,
        workers: params.workers,
        // Opsi ekstra untuk memaksimalkan serangan
        maxConnectionRequests: 100,
        maxOverallRequests: 1000000,
        connectionRate: params.connections * 10,
        overallRate: params.connections * 100,
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: false });
  });
}

const app = new Elysia()
  .use(cors())
  .post('/api/attack', async ({ body }: { body: any }) => {
    const { url, connections, duration, pipelining, workers } = body;
    if (!url) {
      return { error: 'URL is required' };
    }

    // Batasi koneksi untuk mencegah overload server sendiri (opsional)
    const maxConn = Math.min(parseInt(connections) || 100, 10000);
    const maxDur = parseInt(duration) || 10;
    const maxPipe = parseInt(pipelining) || 1;
    const maxWorkers = parseInt(workers) || 1;

    // Peringatan jika durasi > 60 detik (Vercel timeout)
    if (maxDur > 60) {
      console.warn(`Duration ${maxDur}s may exceed Vercel function timeout. Consider deploying to VPS.`);
    }

    try {
      const result: any = await runLoadTest({
        url,
        connections: maxConn,
        duration: maxDur,
        pipelining: maxPipe,
        workers: maxWorkers,
      });
      return {
        success: true,
        stats: {
          requests: result.requests.total,
          avgRps: result.requests.average,
          avgLatency: result.latency.average,
          maxLatency: result.latency.max,
          p99: result.latency.p99,
          errors: result.errors,
          throughput: result.throughput.average,
        },
      };
    } catch (err: any) {
      return { error: err.message };
    }
  });

// 404 handler
app.get('*', ({ set }) => {
  set.status = 404;
  return 'Not Found';
});

// Untuk local development (Bun)
if (typeof Bun !== 'undefined') {
  app.listen(3000, () => {
    console.log('🔥 Elysia server running on http://localhost:3000');
  });
}

export default app;
