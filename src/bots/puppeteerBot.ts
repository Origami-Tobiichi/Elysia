import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function runPuppeteerBot(url: string, options: {
  loop?: boolean;
  intervalMs?: number;
  headless?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const { loop = false, intervalMs = 5000, headless = true } = options;

  try {
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process', // opsi opsional untuk mengurangi resource
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: headless ? true : false,
      ignoreHTTPSErrors: true,
    });

    const runPage = async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      );
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
      await page.close();
    };

    if (loop) {
      (async () => {
        while (true) {
          await runPage().catch(console.error);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      })();
      return { success: true, message: 'Puppeteer bot started in loop mode' };
    } else {
      await runPage();
      await browser.close();
      return { success: true, message: 'Puppeteer bot completed one task' };
    }
  } catch (error: any) {
    console.error(error);
    return { success: false, message: error.message };
  }
}
