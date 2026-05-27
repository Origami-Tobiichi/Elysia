import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

interface ArtilleryOptions {
  url: string;
  duration: number;
  arrivalRate: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function runArtillery(options: ArtilleryOptions): Promise<any> {
  const script = {
    config: {
      target: options.url,
      phases: [
        { duration: options.duration, arrivalRate: options.arrivalRate, name: 'Flood' }
      ],
      defaults: {
        headers: options.headers || {}
      }
    },
    scenarios: [
      {
        name: 'Heavy load',
        flow: [
          { get: { url: '/' } },
          ...(options.method === 'POST' ? [{ post: { url: '/', body: options.body || '' } }] : [])
        ]
      }
    ]
  };
  const scriptPath = '/tmp/artillery-script.json';
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));
  const command = `npx artillery run ${scriptPath}`;
  const { stdout, stderr } = await execAsync(command);
  if (stderr) throw new Error(stderr);
  return stdout;
}
