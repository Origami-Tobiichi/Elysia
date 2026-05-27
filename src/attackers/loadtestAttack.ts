import loadtest from 'loadtest';

interface LoadtestOptions {
  url: string;
  maxRequests: number;
  concurrency: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export async function runLoadtest(options: LoadtestOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    const testOptions: loadtest.TestOptions = {
      url: options.url,
      maxRequests: options.maxRequests,
      concurrency: options.concurrency,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      timeout: options.timeout || 10000,
      requestsPerSecond: options.concurrency,
    };
    loadtest.loadTest(testOptions, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}
