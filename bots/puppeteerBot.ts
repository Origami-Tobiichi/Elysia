import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';

puppeteer.use(StealthPlugin());

export async function runPuppeteerBot(url: string, options: {
  loop?: boolean;
  intervalMs?: number;
  headless?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const { loop = false, intervalMs = 5000, headless = true } = options;

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: headless ? true : false, // pastikan boolean, bukan 'new'
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
      await new Promise(resolve => setTimeout(resolve, 2000)); // ganti waitForTimeout
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
