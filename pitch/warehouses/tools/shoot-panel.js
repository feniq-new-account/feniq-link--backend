// يصوّر لوحة المستودع (النسخة المحلية المبذورة بـ seed-showcase.js) إلى assets/shots/.
//   PLAYWRIGHT_CORE=<playwright-core> CHROMIUM_PATH=<chrome> \
//   PANEL_URL=http://127.0.0.1:5173 node pitch/warehouses/tools/shoot-panel.js
// نافذة 1440×810 بمقياس 4/3 = لقطات 1920×1080.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const PANEL = process.env.PANEL_URL || 'http://127.0.0.1:5173';
const OUT = path.resolve(__dirname, '../assets/shots');
const save = (page, name, options = {}) =>
  page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 88, ...options });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const open = async (route, wait = 1600) => {
    await page.goto(PANEL + route);
    await page.waitForTimeout(wait);
  };

  await page.goto(PANEL + '/');
  await page.fill('#phone', '0930000200');
  await page.fill('#password', 'Feniq@Demo2026');
  await page.click('button:has-text("تسجيل الدخول") >> nth=-1');
  await page.waitForTimeout(2500);

  // الطلبات: كل الحالات
  await open('/warehouse/orders');
  await page.click('button:has-text("الكل")');
  await page.waitForTimeout(1200);
  await save(page, 'd1-orders.jpg');

  // طلبية بالطريق: الأصناف وسجل الحالات (بلا بطاقة الملخص المالي)
  await page.click('tbody tr >> nth=2');
  await page.waitForTimeout(2000);
  await save(page, 'd2-order.jpg', { clip: { x: 380, y: 64, width: 820, height: 746 } });

  // الكتالوج: صفحة شركة بأسعارها وبونصها
  await open('/warehouse/products');
  await page.click('text=بركات');
  await page.waitForTimeout(1800);
  await save(page, 'd3-catalog.jpg');

  // العروض
  await open('/warehouse/offers');
  await save(page, 'd4-offers.jpg');

  // المناديب وصفحة المندوب
  await open('/warehouse/reps');
  await save(page, 'd5-reps.jpg', { clip: { x: 0, y: 0, width: 1440, height: 660 } });
  await page.click('a.wh-link >> nth=1');
  await page.waitForTimeout(2000);
  await save(page, 'd6-rep.jpg');

  // جدول الحسابات: مشتريات، مدفوع، باقي، آخر دفعة
  await open('/warehouse/debts');
  await save(page, 'd7-balances.jpg');

  // «قبضت؟» عند «تم التسليم»: كامل / جزء / بعدين
  await open('/warehouse/orders');
  await page.click('button.wh-pill:has-text("بالطريق")');
  await page.waitForTimeout(1500);
  await page.click('.wh-row-action.wh-advance-to-delivered >> nth=0');
  await page.waitForTimeout(800);
  await save(page, 'd8-collect.jpg');

  // تسجيل دفعة بالصوت: الجملة المسموعة تتحول لبطاقة تأكيد
  await open('/warehouse/debts');
  await page.click('button.wh-voice-btn');
  await page.waitForTimeout(1200);
  await page.fill('.modal input[type="text"]', 'صيدلية الياسمين دفعت ثلاثة آلاف');
  await page.waitForTimeout(600);
  await save(page, 'd9-voice.jpg');

  await browser.close();
  console.log('saved to', OUT);
})();
