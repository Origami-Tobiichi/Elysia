// api/index.js
import { app } from '../dist/index.js';

// Elysia app sudah memiliki method .handle yang sesuai dengan format Vercel
export default async function handler(req, res) {
  // Vercel serverless function menerima req (http.IncomingMessage) dan res (ServerResponse)
  // Kita konversi ke format yang diharapkan Elysia
  const response = await app.handle(new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  }));
  
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  
  const body = await response.text();
  res.end(body);
}
