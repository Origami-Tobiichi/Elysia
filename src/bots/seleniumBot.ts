export async function runSeleniumBot(url: string): Promise<{ success: boolean; message: string }> {
  return { success: false, message: 'Selenium not supported on Vercel. Use Puppeteer instead.' };
}
