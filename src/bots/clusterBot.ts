import { Cluster } from 'puppeteer-cluster';
import chromium from '@sparticuz/chromium';

export async function runClusterBot(url: string, options: {
  concurrency?: number;
  totalTasks?: number;
  loop?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const { concurrency = 10, totalTasks = 100, loop = false } = options;

  try {
    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: concurrency,
      puppeteerOptions: {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true, // gunakan true, bukan chromium.headless yang bisa 'new'
        ignoreHTTPSErrors: true,
      },
    });

    await cluster.task(async ({ page, data }) => {
      await page.goto(data.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    if (loop) {
      (async () => {
        while (true) {
          for (let i = 0; i < totalTasks; i++) {
            cluster.queue({ url });
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      })();
      return { success: true, message: `Cluster bot started with ${concurrency} workers, loop mode` };
    } else {
      for (let i = 0; i < totalTasks; i++) {
        cluster.queue({ url });
      }
      await cluster.idle();
      await cluster.close();
      return { success: true, message: `Cluster bot completed ${totalTasks} tasks` };
    }
  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message };
  }
}
