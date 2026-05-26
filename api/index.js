import { createRequire } from 'node:module';
import { buffer } from 'node:stream/consumers';

const require = createRequire(import.meta.url);

export default async function handler(req, res) {
  let app;
  try {
    // Coba import ESM (hasil bundle)
    const module = await import('../dist/index.js');
    app = module.default || module.app || module;
    if (!app || typeof app.fetch !== 'function') throw new Error('Invalid app');
  } catch (err) {
    console.error('ESM import failed, trying CommonJS:', err);
    try {
      // Fallback ke require (jika bundle menghasilkan CommonJS)
      const module = require('../dist/index.js');
      app = module.default || module.app || module;
    } catch (err2) {
      console.error('CommonJS fallback failed:', err2);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Failed to load app: ${err2.message}` }));
      return;
    }
  }

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
