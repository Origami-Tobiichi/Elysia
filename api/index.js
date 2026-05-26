import app from '../dist/index.js';
import { buffer } from 'node:stream/consumers';

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const url = new URL(req.url, `${protocol}://${host}`);

    let bodyBuffer = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: bodyBuffer,
    });

    const response = await app.fetch(request);
    const responseBody = await response.text();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(responseBody);
  } catch (err) {
    console.error('Handler error:', err);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal server error' }));
  }
}
