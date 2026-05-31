import { app } from '../dist/index.js';

export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const url = new URL(req.url, `${protocol}://${host}`);

    // Baca body untuk request non-GET/HEAD
    let bodyBuffer = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    // Buat request object standar Web API
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: bodyBuffer,
    });

    // Dapatkan response dari aplikasi Elysia
    const response = await app.fetch(request);
    const responseBody = await response.text();

    // Selalu kembalikan status 200 OK dengan Content-Type JSON
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(responseBody);
  } catch (err) {
    // Fallback error handler: tetap kirim JSON dengan status 200
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}
