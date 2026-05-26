import { Builder, Browser, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

export async function runSeleniumBot(url: string, options: {
  loop?: boolean;
  intervalMs?: number;
  headless?: boolean;
}): Promise<void> {
  const { loop = false, intervalMs = 5000, headless = true } = options;

  const driver = await new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(
      new chrome.Options()
        .addArguments('--no-sandbox')
        .addArguments('--disable-dev-shm-usage')
        .addArguments(headless ? '--headless' : '')
        .addArguments('--window-size=1920,1080')
    )
    .build();

  const runDriver = async () => {
    await driver.get(url);
    await driver.executeScript('window.scrollTo(0, document.body.scrollHeight);');
    await driver.sleep(2000);
  };

  if (loop) {
    while (true) {
      await runDriver().catch(console.error);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  } else {
    await runDriver();
    await driver.quit();
  }
}
