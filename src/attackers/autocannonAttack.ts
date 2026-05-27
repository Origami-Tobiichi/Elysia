import autocannon from 'autocannon';

interface AutocannonOptions {
  url: string;
  connections: number;
  duration: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  amount?: number;
}

export async function runAutocannon(options: AutocannonOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: options.url,
      connections: options.connections,
      duration: options.duration,
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      amount: options.amount,
      pipelining: 1,
      reconnectRate: 0,
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}
