const express = require('express');
const autocannon = require('autocannon');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Simpan instance autocannon yang sedang berjalan
let activeInstance = null;
let currentAttackId = null;
let attackCounter = 0;
let sseClients = [];

// SSE endpoint untuk live log
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
  });
});

// Fungsi mengirim event ke semua client SSE
function sendEvent(data) {
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Fungsi menjalankan attack dengan live log
function runAttack(params, attackId) {
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
    activeInstance = instance;
    currentAttackId = attackId;

    // Track progress setiap 500ms
    let lastRequests = 0;
    const interval = setInterval(() => {
      if (!activeInstance || activeInstance !== instance) {
        clearInterval(interval);
        return;
      }
      const current = instance.requestsCompleted || 0;
      const rps = current - lastRequests;
      lastRequests = current;
      sendEvent({
        type: 'progress',
        requests: current,
        rps: rps * 2, // karena interval 0.5 detik
        errors: instance.errors || 0,
      });
    }, 500);

    instance.on('done', () => {
      clearInterval(interval);
      activeInstance = null;
      currentAttackId = null;
      sendEvent({ type: 'done' });
    });

    autocannon.track(instance, { renderProgressBar: false });
  });
}

app.post('/api/attack', async (req, res) => {
  try {
    const { url, connections, duration, pipelining, workers } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    if (activeInstance) {
      return res.status(409).json({ error: 'Attack already running. Stop it first.' });
    }

    const conn = Math.min(parseInt(connections) || 100, 10000);
    const dur = parseInt(duration) || 10;
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    if (dur > 60) console.warn(`Duration ${dur}s may exceed Vercel timeout.`);

    const attackId = ++attackCounter;
    sendEvent({ type: 'start', message: `🚀 Attack started: ${url} (${conn} conn, ${dur}s)` });

    const result = await runAttack({ url, connections: conn, duration: dur, pipelining: pipe, workers: work }, attackId);

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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  if (activeInstance) {
    activeInstance.stop();
    activeInstance = null;
    sendEvent({ type: 'stop', message: '⏹ Attack stopped by user' });
    res.json({ success: true, message: 'Attack stopped' });
  } else {
    res.json({ success: false, message: 'No active attack' });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
