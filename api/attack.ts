import express, { Request, Response } from 'express';
import autocannon from 'autocannon';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Tipe untuk parameter load test
interface LoadTestParams {
  url: string;
  connections: number;
  duration: number;
  pipelining: number;
  workers: number;
}

// Tipe untuk hasil autocannon (sesuai dokumentasi)
interface AutocannonResult {
  requests: {
    total: number;
    average: number;
  };
  latency: {
    average: number;
    max: number;
    p99: number;
  };
  throughput: {
    average: number;
  };
  errors: number;
}

// Fungsi untuk menjalankan autocannon dengan Promise
function runLoadTest(params: LoadTestParams): Promise<AutocannonResult> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: params.url,
        connections: params.connections,
        duration: params.duration,
        pipelining: params.pipelining,
        workers: params.workers,
      },
      (err: Error | null, result: AutocannonResult) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: false });
  });
}

app.post('/api/attack', async (req: Request, res: Response) => {
  try {
    const { url, connections, duration, pipelining, workers } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Valid URL is required' });
    }

    const conn = Math.min(parseInt(connections) || 100, 10000);
    const dur = parseInt(duration) || 10;
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    if (dur > 60) {
      console.warn(`⚠️ Duration ${dur}s may exceed Vercel function timeout (max 60s).`);
    }

    const result = await runLoadTest({
      url,
      connections: conn,
      duration: dur,
      pipelining: pipe,
      workers: work,
    });

    res.json({
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
    });
  } catch (err: unknown) {
    console.error('Attack error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
});

// Untuk local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

export default app;
