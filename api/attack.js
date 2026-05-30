const express = require('express');
const autocannon = require('autocannon');
const cors = require('cors');
const { PassThrough } = require('stream');

const app = express();
app.use(cors());
app.use(express.json());

let activeInstance = null;
let sseClients = [];

// SSE endpoint untuk live log
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const client = { id: Date.now(), res };
  sseClients.push(client);
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== client.id);
  });
});

function sendEvent(data) {
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

function runAttack(params, onProgress) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: params.url,
      connections: params.connections,
      duration: params.duration,
      pipelining: params.pipelining,
      workers: params.workers,
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });

    activeInstance = instance;

    // Progress setiap 500ms
    let lastRequests = 0;
    const interval = setInterval(() => {
      if (!activeInstance || activeInstance !== instance) {
        clearInterval(interval);
        return;
      }
      const requests = instance.requestsCompleted || 0;
      const rps = (requests - lastRequests) * 2;
      lastRequests = requests;
      const errors = instance.errors || 0;
      onProgress({ requests, rps, errors });
    }, 500);

    // Tangkap semua output autocannon (termasuk tabel)
    const outputStream = new PassThrough();
    outputStream.on('data', chunk => {
      const text = chunk.toString();
      text.split('\n').forEach(line => {
        if (line.trim()) sendEvent({ type: 'log', message: line });
      });
    });
    autocannon.track(instance, { outputStream, renderProgressBar: true, renderResultsTable: true });

    instance.on('done', () => {
      clearInterval(interval);
      activeInstance = null;
      sendEvent({ type: 'done' });
    });
  });
}

app.post('/api/attack', async (req, res) => {
  try {
    const { url, connections, duration, pipelining, workers } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    if (activeInstance) return res.status(409).json({ error: 'Attack already running' });

    let dur = parseInt(duration) || 10;
    const MAX_DURATION = 60; // Vercel limit
    if (dur > MAX_DURATION) {
      sendEvent({ type: 'log', message: `⚠️ Duration ${dur}s exceeds Vercel limit (${MAX_DURATION}s). Limiting to ${MAX_DURATION}s.` });
      dur = MAX_DURATION;
    }
    const conn = Math.min(parseInt(connections) || 100, 10000);
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    sendEvent({ type: 'log', message: `🚀 Starting attack on ${url} (${conn} connections, ${dur}s)` });

    let progressStats = { requests: 0, rps: 0, errors: 0 };
    const result = await runAttack({ url, connections: conn, duration: dur, pipelining: pipe, workers: work }, (progress) => {
      progressStats = progress;
      sendEvent({ type: 'stats', stats: progressStats });
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
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  if (activeInstance) {
    activeInstance.stop();
    activeInstance = null;
    sendEvent({ type: 'log', message: '⏹ Attack stopped by user' });
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'No active attack' });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
