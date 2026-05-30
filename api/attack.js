const express = require('express');
const autocannon = require('autocannon');
const cors = require('cors');
const { PassThrough } = require('stream');

const app = express();
app.use(cors());
app.use(express.json());

let activeInstance = null;
let sseClients = [];

// Endpoint Server-Sent Events untuk live log
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

function runAttack(params) {
  return new Promise((resolve, reject) => {
    const outputStream = new PassThrough();
    outputStream.on('data', chunk => {
      const text = chunk.toString();
      // Kirim setiap baris ke client (termasuk tabel, warning, progress)
      text.split('\n').forEach(line => {
        if (line.trim()) sendEvent({ type: 'log', message: line });
      });
    });

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
    // Track progress dan kirim ke outputStream
    autocannon.track(instance, { outputStream, renderProgressBar: true, renderResultsTable: true });

    instance.on('done', () => {
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

    const conn = Math.min(parseInt(connections) || 100, 10000);
    const dur = parseInt(duration) || 10;
    const pipe = parseInt(pipelining) || 1;
    const work = parseInt(workers) || 1;

    sendEvent({ type: 'log', message: `🚀 Starting attack on ${url} (${conn} connections, ${dur}s)` });

    const result = await runAttack({ url, connections: conn, duration: dur, pipelining: pipe, workers: work });

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
