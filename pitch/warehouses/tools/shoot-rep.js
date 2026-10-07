// يصوّر شاشات المندوب وباركود الصيدلية من تطبيق Flutter web المبني محلياً (انظر shoot-app.js).
//   PLAYWRIGHT_CORE=<playwright-core> CHROMIUM_PATH=<chrome> APP_URL=http://127.0.0.1:8081 \
//   node pitch/warehouses/tools/shoot-rep.js
// المندوب: 0940000201، والصيدلية: 0931000001 (من seed-showcase.js).
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const APP = process.env.APP_URL || 'http://127.0.0.1:8081';
const OUT = path.resolve(__dirname, '../assets/shots');
const PASSWORD = 'Feniq@Demo2026';
// أماكن ثابتة (بكسلات CSS): تبويبات المندوب من اليمين لليسار، والزر العائم.
const TAB = { pharmacies: [372, 870], visits: [207, 870], profile: [41, 870] };
const SCAN_BUTTON = [110, 785];

let browser;

async function session(phoneDigits, fn, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'ar-SY',
    ...options,
  });
  const page = await context.newPage();
  await page.goto(APP + '/');
  await page.waitForTimeout(8000);
  await page.mouse.click(237, 414);
  await page.keyboard.type(phoneDigits, { delay: 40 });
  await page.mouse.click(207, 507);
  await page.keyboard.type(PASSWORD, { delay: 40 });
  await page.mouse.click(207, 603);
  await page.waitForTimeout(7000);
  const placeholder = await page.$('flt-semantics-placeholder');
  if (placeholder) await placeholder.evaluate((el) => el.click());
  await page.waitForTimeout(800);
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => {
  await page.mouse.move(207, 300); // يزيل تلميح الشريط السفلي
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, name) });
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // المندوب أحمد: صيدلياته، تفاصيل صيدلية، زياراته، حسابه
  await session('40000201', async (page) => {
    await shot(page, 'r1-pharmacies.png');
    await page.mouse.click(207, 280); // أول بطاقة (الأقدم زيارة)
    await page.waitForTimeout(3500);
    await shot(page, 'r2-pharmacy.png');
    await page.goBack();
    await page.waitForTimeout(2000);
    await page.mouse.click(...TAB.visits);
    await page.waitForTimeout(3000);
    await shot(page, 'r3-visits.png');
    await page.mouse.click(...TAB.profile);
    await page.waitForTimeout(2500);
    await shot(page, 'r4-profile.png');
  });

  // الصيدلية: باركود الزيارة الذي يمسحه المندوب
  await session('31000001', async (page) => {
    await page.mouse.click(41, 870); // البروفايل
    await page.waitForTimeout(3000);
    // البطاقة تحت الشاشة: نمرّر قليلاً ثم نضغط عليها.
    await page.mouse.move(207, 500);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(1200);
    await page.getByText('للمناديب الذين يزورونك', { exact: false }).first().click();
    await page.waitForTimeout(3500);
    await shot(page, 'r5-visit-code.png');
  });

  await browser.close();
  console.log('saved to', OUT);
})();
