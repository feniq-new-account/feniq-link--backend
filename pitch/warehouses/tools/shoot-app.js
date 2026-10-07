// يصوّر تطبيق الصيدلية (Flutter web مبني محلياً ومخدَّم على APP_URL) إلى assets/shots/.
// يدخل بحساب الصيدلية التجريبية الأولى من seed-showcase.js.
//   PLAYWRIGHT_CORE=<playwright-core> CHROMIUM_PATH=<chrome> \
//   APP_URL=http://127.0.0.1:8081 node pitch/warehouses/tools/shoot-app.js
// بناء نسخة الويب (Flutter 3.38+، نسخة مؤقتة من phoenix/ لأن pub get بيعدّل القفل):
//   flutter build web --release --dart-define=API_BASE_URL=http://127.0.0.1:4000/api
// الشاشة 414×896 بمقياس 2 = 828×1792 (مثل لقطات الجوال القديمة).
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const APP = process.env.APP_URL || 'http://127.0.0.1:8081';
const OUT = path.resolve(__dirname, '../assets/shots');
const PHONE_DIGITS = '31000001'; // 0931000001، بعد البادئة الثابتة 09
const PASSWORD = 'Feniq@Demo2026';
// أماكن ثابتة على الشاشة (بكسلات CSS): حقول الدخول، وأيقونات الشريط السفلي.
const NAV = { stores: [372, 870], offers: [290, 870], orders: [207, 870] };

let browser;

async function session(fn) {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'ar-SY',
  });
  const page = await context.newPage();
  await page.goto(APP + '/');
  await page.waitForTimeout(8000);
  await page.mouse.click(237, 414);
  await page.keyboard.type(PHONE_DIGITS, { delay: 40 });
  await page.mouse.click(207, 507);
  await page.keyboard.type(PASSWORD, { delay: 40 });
  await page.mouse.click(207, 603);
  await page.waitForTimeout(6000);
  // يشغّل شجرة الوصول (semantics) لنقدر نضغط بالنص.
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
const tapText = (page, text, nth = 0) => page.getByText(text, { exact: false }).nth(nth).click();
const wait = (page, ms) => page.waitForTimeout(ms);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // الرئيسية: بانر المستودع وبطاقته
  await session(async (page) => {
    await shot(page, 'a1-home.png');
  });

  // أصناف شركة: السعر والبونص والعرض والبدائل، ثم السلة بصنفين
  await session(async (page) => {
    await page.mouse.click(300, 520);
    await wait(page, 3000);
    await tapText(page, 'Bahri');
    await wait(page, 3000);
    await shot(page, 'a2-products.png');

    // الصنف الثالث (سيبروكسين) بكمية 5، ثم الرابع (باراسيتامول، عليه عرض) بكمية 10
    await page.mouse.click(150, 571);
    await wait(page, 1200);
    for (let i = 0; i < 4; i += 1) { await page.mouse.click(44, 778); await wait(page, 250); }
    await page.mouse.click(207, 845);
    await wait(page, 1500);
    await page.mouse.click(150, 753);
    await wait(page, 1200);
    for (let i = 0; i < 9; i += 1) { await page.mouse.click(44, 778); await wait(page, 250); }
    await page.mouse.click(207, 845);
    await wait(page, 1500);
    await page.mouse.click(35, 31); // السلة
    await wait(page, 6500); // حتى يختفي إشعار «تمت الإضافة»
    await shot(page, 'a3-cart.png');
  });

  // العروض والباقات
  await session(async (page) => {
    await page.mouse.click(...NAV.offers);
    await wait(page, 3500);
    await shot(page, 'a4-offers.png');
  });

  // الطلبات، ثم تتبّع طلبية بالطريق
  await session(async (page) => {
    await page.mouse.click(...NAV.orders);
    await wait(page, 3500);
    await shot(page, 'a5-orders.png');
    await tapText(page, 'الطلب رقم 4');
    await wait(page, 3500);
    await shot(page, 'a6-tracking.png');
  });

  await browser.close();
  console.log('saved to', OUT);
})();
