import express, { Request, Response } from 'express';
import autocannon from 'autocannon';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

interface AttackParams {
  url: string;
  connections: number;
  duration: number;
  pipelining: number;
  workers: number;
}

function runLoadTest(params: AttackParams): Promise<any> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: params.url,
        connections: params.connections,
        duration: params.duration,
        pipelining: params.pipelining,
        workers: params.workers,
      },
      (err, result) => {
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
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const conn = Math.min(parseInt(connections) || 100, 10000);
    const dur = parseInt(duration) || 10;
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    if (dur > 60) {
      console.warn(`Duration ${dur}s may exceed Vercel function timeout.`);
    }

    const result: any = await runLoadTest({
      url,
      connections: conn,
      duration: dur,
      pipelining: pipe,
      workers: work,
    });

    res.json({
      success: true,
      stats: {
        requests: result.requests?.total || 0,
        avgRps: result.requests?.average || 0,
        avgLatency: result.latency?.average || 0,
        maxLatency: result.latency?.max || 0,
        p99: result.latency?.p99 || 0,
        errors: result.errors || 0,
        throughput: result.throughput?.average || 0,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Untuk local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
