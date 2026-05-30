import express from 'express';
import autocannon from 'autocannon';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Helper: run autocannon
function runLoadTest(params) {
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

app.post('/api/attack', async (req, res) => {
  try {
    const { url, connections, duration, pipelining, workers } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const conn = Math.min(parseInt(connections) || 100, 10000);
    const dur = parseInt(duration) || 10;
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    // Peringatan jika durasi > 60 detik (Vercel timeout)
    if (dur > 60) {
      console.warn(`Duration ${dur}s may exceed Vercel timeout.`);
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Untuk local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
