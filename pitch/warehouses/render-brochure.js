// ورقة «فينيق بصفحة» (A4): node render-brochure.js -> out/brochure.pdf + out/brochure.png
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(__dirname, 'brochure.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.pdf({ path: path.join(__dirname, 'out', 'brochure.pdf'), preferCSSPageSize: true, printBackground: true });
  await page.screenshot({ path: path.join(__dirname, 'out', 'brochure.png') });
  await browser.close();
})();
