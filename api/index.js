import { app } from '../dist/index.js';
import { buffer } from 'node:stream/consumers';

export default async function handler(req, res) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const url = new URL(req.url, `${protocol}://${host}`);

  let bodyBuffer = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    bodyBuffer = await buffer(req);
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: bodyBuffer,
  });

  const response = await app.fetch(request);

  // Pastikan status selalu 200 OK untuk semua respon dari API
  res.statusCode = 200;
  for (const [key, value] of response.headers) {
    if (key !== 'content-length') res.setHeader(key, value);
  }
  const responseBody = await response.text();
  res.end(responseBody);
}
