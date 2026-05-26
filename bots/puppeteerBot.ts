import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export async function runPuppeteerBot(url: string, options: {
  loop?: boolean;
  intervalMs?: number;
  headless?: boolean;
}): Promise<void> {
  const { loop = false, intervalMs = 5000, headless = true } = options;
  
  const browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  const runPage = async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    // Simulasi aktivitas manusia
    await page.waitForTimeout(2000);
    await page.close();
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
