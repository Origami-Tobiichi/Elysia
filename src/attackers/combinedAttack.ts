import { runAutocannon } from './autocannonAttack.js';
import { runLoadtest } from './loadtestAttack.js';
import { runArtillery } from './artilleryAttack.js';

interface CombinedOptions {
  url: string;
  connections: number;
  duration: number;
  totalRequests: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function runCombinedAttack(options: CombinedOptions): Promise<any> {
  const results: any = {};
  const autocannonPromise = runAutocannon({
    url: options.url,
    connections: options.connections,
    duration: options.duration,
    method: options.method,
    headers: options.headers,
    body: options.body,
    amount: options.totalRequests,
  }).then(res => { results.autocannon = res; }).catch(err => { results.autocannon = { error: err.message }; });

  const loadtestPromise = runLoadtest({
    url: options.url,
    maxRequests: options.totalRequests,
    concurrency: options.connections,
    method: options.method,
    headers: options.headers,
    body: options.body,
  }).then(res => { results.loadtest = res; }).catch(err => { results.loadtest = { error: err.message }; });

  const artilleryPromise = runArtillery({
    url: options.url,
    duration: options.duration,
    arrivalRate: Math.floor(options.connections / 5),
    method: options.method,
    headers: options.headers,
    body: options.body,
  }).then(res => { results.artillery = res; }).catch(err => { results.artillery = { error: err.message }; });

  await Promise.all([autocannonPromise, loadtestPromise, artilleryPromise]);
  return results;
}
