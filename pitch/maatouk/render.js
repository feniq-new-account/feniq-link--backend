// يطلّع ملفات PDF والصور من صفحات HTML (Chromium عبر playwright-core).
//   node render.js pack     -> out/board-pack.pdf + out/summary.pdf + معاينات PNG
//   node render.js deck     -> out/deck.pdf + out/slides/NN.png (للـPPTX)
// المسار إلى Chromium من CHROMIUM_PATH، ومسار playwright-core من PLAYWRIGHT_CORE.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const HERE = __dirname;
const OUT = path.join(HERE, 'out');
const what = process.argv[2] || 'pack';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  if (what === 'pack') {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
    await page.goto('file://' + path.join(HERE, 'board-pack.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.pdf({ path: path.join(OUT, 'board-pack.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.pdf({ path: path.join(OUT, 'summary.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true, pageRanges: '1' });
    const pages = await page.$$('section.page');
    fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });
    for (const [i, el] of pages.entries()) await el.screenshot({ path: path.join(OUT, 'preview', `pack-${i + 1}.png`) });
  } else {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 });
    await page.goto('file://' + path.join(HERE, 'deck.html'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.pdf({ path: path.join(OUT, 'deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
    const slides = await page.$$('section.slide');
    fs.mkdirSync(path.join(OUT, 'slides'), { recursive: true });
    for (const [i, el] of slides.entries()) await el.screenshot({ path: path.join(OUT, 'slides', `${String(i + 1).padStart(2, '0')}.png`) });
  }
  await browser.close();
})();
