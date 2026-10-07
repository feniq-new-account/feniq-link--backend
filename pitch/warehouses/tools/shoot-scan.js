// يصوّر شاشة مسح الباركود من الطرف إلى الطرف: كاميرا وهمية تعرض باركود صيدلية حقيقي
// (من السيرفر المحلي)، وموقع وهمي للمتصفح. نفس المسار الذي بيمشي عليه التطبيق على الموبايل:
// الكاميرا ← قراءة الباركود ← الموقع ← POST /rep/visits ← نتيجة السيرفر.
//   PLAYWRIGHT_CORE=<playwright-core> QRCODE=<مسار حزمة npm qrcode> CHROMIUM_PATH=<chrome> \
//   APP_URL=http://127.0.0.1:8081 API_URL=http://127.0.0.1:4000/api node pitch/warehouses/tools/shoot-scan.js
// يحتاج ffmpeg بالـPATH. المندوب أحمد يمسح باركود «صيدلية الفجر» (صيدليته الثالثة).
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const QRCode = require(process.env.QRCODE || 'qrcode');

const APP = process.env.APP_URL || 'http://127.0.0.1:8081';
const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
const OUT = path.resolve(__dirname, '../assets/shots');
const PASSWORD = 'Feniq@Demo2026';
// صيدلية الفجر (من seed-showcase.js): [طول، عرض]
const FAJR = { latitude: 35.519, longitude: 35.779 };

async function login(phone) {
  const response = await fetch(`${API}/auth/login-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password: PASSWORD }),
  });
  return (await response.json()).token;
}

// فيديو عمودي: باركود أبيض صغير على خلفية داكنة، كأن الموبايل موجّه نحو ملصق على الزجاج.
async function makeFakeCamera(dir, payload) {
  const png = path.join(dir, 'qr.png');
  await QRCode.toFile(png, payload, { width: 360, margin: 3 });
  const video = path.join(dir, 'camera.mjpeg');
  const run = spawnSync(
    'ffmpeg',
    ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x1b2c45:s=480x854:r=10', '-loop', '1', '-i', png,
      '-filter_complex', '[1:v]scale=230:230[q];[0:v][q]overlay=(W-w)/2:(H-h)/2+4', '-t', '8', '-r', '10',
      '-pix_fmt', 'yuvj420p', '-c:v', 'mjpeg', video],
    { encoding: 'utf8' }
  );
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${run.stderr}`);
  return video;
}

async function shootScan(browserArgs, geolocation, name, waitMs) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: browserArgs });
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    locale: 'ar-SY',
    permissions: ['camera', 'geolocation'],
    geolocation: { ...geolocation, accuracy: 12 },
  });
  const page = await context.newPage();
  await page.goto(APP + '/');
  await page.waitForTimeout(8000);
  await page.mouse.click(237, 414);
  await page.keyboard.type('40000201', { delay: 40 });
  await page.mouse.click(207, 507);
  await page.keyboard.type(PASSWORD, { delay: 40 });
  await page.mouse.click(207, 603);
  await page.waitForTimeout(7000);
  const placeholder = await page.$('flt-semantics-placeholder');
  if (placeholder) await placeholder.evaluate((el) => el.click());
  await page.waitForTimeout(800);
  await page.mouse.click(110, 785); // «مسح باركود الزيارة»
  await page.waitForTimeout(waitMs);
  await page.mouse.move(207, 300);
  await page.screenshot({ path: path.join(OUT, name) });
  await browser.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login('+963931000003'); // صيدلية الفجر
  const { qrPayload } = await (await fetch(`${API}/pharmacy/visit-code`, { headers: { authorization: `Bearer ${token}` } })).json();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feniq-scan-'));
  const video = await makeFakeCamera(dir, qrPayload);
  const args = [
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`,
  ];
  // عند الصيدلية: زيارة موثّقة
  await shootScan(args, FAJR, 'r6-scan-verified.png', 9000);
  // على بعد ~1.1 كم: تُسجَّل غير موثّقة مع المسافة
  await shootScan(args, { latitude: FAJR.latitude + 0.01, longitude: FAJR.longitude }, 'r7-scan-out-of-range.png', 9000);
  console.log('saved to', OUT);
})();
