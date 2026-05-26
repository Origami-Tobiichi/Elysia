import { Cluster } from 'puppeteer-cluster';

export async function runClusterBot(url: string, options: {
  concurrency?: number;
  totalTasks?: number;
  loop?: boolean;
}): Promise<void> {
  const { concurrency = 10, totalTasks = 100, loop = false } = options;

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: concurrency,
    puppeteerOptions: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  await cluster.task(async ({ page, data }) => {
    await page.goto(data.url, { waitUntil: 'networkidle2' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  });

  if (loop) {
    while (true) {
      for (let i = 0; i < totalTasks; i++) {
        cluster.queue({ url });
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } else {
    for (let i = 0; i < totalTasks; i++) {
      cluster.queue({ url });
    }
    await cluster.idle();
    await cluster.close();
  }
}
