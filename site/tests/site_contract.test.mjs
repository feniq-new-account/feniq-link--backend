import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = load('../index.html');
const script = load('../app.js');
const css = load('../styles.css');
const privacy = load('../privacy.html');
const sitemap = load('../sitemap.xml');
const robots = load('../robots.txt');

test('document has one unique linked destination for every internal anchor', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs');
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  for (const anchor of anchors) assert.ok(ids.includes(anchor), 'missing #' + anchor);
});
test('launch content reflects actual role boundaries and closed launch', () => {
  for (const content of ['الصيدلاني','المندوب','مدير المستودع','المحاسب','إدارة فينيق','التسجيل والتصفح متاحان']) {
    assert.ok(html.includes(content), content);
  }
  assert.doesNotMatch(html, /تجربة 30 يوماً|تجربة 60 يوماً|فينيق يسجّل التعامل/);
  assert.match(html, /إرسال الطلبات مرتبط/);
});
test('no historical screenshot or brochure markets stale finance flows', () => {
  assert.doesNotMatch(html, /screen-collect\.webp|screen-voice\.webp|screen-accounts\.webp|feniq-warehouses\.pdf/);
  assert.match(html, /capability-grid/);
});
test('mobile navigation is accessible and dismissible', () => {
  assert.match(html, /id="menu-toggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="mobile-menu"[^>]*hidden/);
  assert.match(script, /event\.key === "Escape"/);
  assert.match(script, /setAttribute\("aria-expanded"/);
  assert.match(css, /\.mobile-menu:not\(\[hidden\]\)/);
});
test('legacy download never becomes a production APK link by default', () => {
  assert.match(html, /id="apk" href="https:\/\/wa\.me\//);
  assert.doesNotMatch(html, /id="apk" href="feniq\.apk"/);
  for (const field of ['v.sha256','v.certificateSha256','v.applicationId','v.versionName','v.file']) assert.ok(script.includes(field),field);
  assert.match(script, /if \(!isVerifiedManifest\(v\)\)/);
});
test('demo has an explicit no-real-orders boundary', () => {
  assert.match(html, /محاكاة/);
  assert.match(html, /لا يُرسل منها أي طلب/);
  assert.doesNotMatch(script, /fetch\(["']\/api\/orders/);
});
test('SEO canonical, sharing metadata and index files agree', () => {
  assert.match(html, /rel="canonical" href="https:\/\/feniq-site\.onrender\.com\/"/);
  assert.match(html, /og:type/);
  assert.match(html, /og:image:alt/);
  assert.match(sitemap, /https:\/\/feniq-site\.onrender\.com\/privacy\.html/);
  assert.match(robots, /Sitemap: https:\/\/feniq-site\.onrender\.com\/sitemap\.xml/);
});
test('privacy matches the permissions and signed-release approach', () => {
  assert.match(privacy, /الموقع في الخلفية/);
  assert.match(privacy, /التوقيع/);
  assert.doesNotMatch(privacy, /Firebase خدمات الإشعارات وإعدادات التحديث/);
});
test('public text contains no hard-coded current APK build', () => {
  assert.doesNotMatch(html, /Build 22|19 تشرين الأول 2026/);
  assert.match(script, /v\.build/);
});
