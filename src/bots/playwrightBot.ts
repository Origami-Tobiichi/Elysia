export async function runPlaywrightBot(url: string): Promise<{ success: boolean; message: string }> {
  return { success: false, message: 'Playwright not supported on Vercel. Use Puppeteer instead.' };
}
