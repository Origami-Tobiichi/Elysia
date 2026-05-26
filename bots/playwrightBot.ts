import { chromium } from 'playwright';

export async function runPlaywrightBot(url: string, options: {
  loop?: boolean;
  intervalMs?: number;
  headless?: boolean;
}): Promise<void> {
  const { loop = false, intervalMs = 5000, headless = true } = options;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const runPage = async () => {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  };

  if (loop) {
    while (true) {
      await runPage().catch(console.error);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  } else {
    await runPage();
    await browser.close();
  }
}
