const ext = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API_HOST = 'https://feniq-connect-api.onrender.com/*';

const DEFAULTS = { currency: 'ل.س', inviteOn: true, inviteLink: 'https://feniq-site.onrender.com', warehouseName: '' };

function say(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// ---------------------------------------------------------------- التبويبات

const tabs = ['feniq', 'paste', 'demo'];
function selectTab(name) {
  for (const t of tabs) {
    $('t-' + t).setAttribute('aria-selected', String(t === name));
    $('p-' + t).hidden = t !== name;
  }
}
tabs.forEach((t) => $('t-' + t).addEventListener('click', () => selectTab(t)));
$('t-feniq').parentElement.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const i = tabs.findIndex((t) => $('t-' + t).getAttribute('aria-selected') === 'true');
  const next = tabs[(i + (e.key === 'ArrowLeft' ? 1 : tabs.length - 1)) % tabs.length];
  selectTab(next);
  $('t-' + next).focus();
});

// ---------------------------------------------------------------- الحالة

async function renderStatus() {
  const { catalog, feniqAuth } = await ext.storage.local.get(['catalog', 'feniqAuth']);
  const el = $('cat-status');
  if (!catalog || !catalog.items || !catalog.items.length) {
    el.textContent = 'ما في كتالوج بعد.';
  } else {
    const src = catalog.source === 'feniq' ? 'من حساب فينيق' : catalog.source === 'demo' ? 'تجريبي' : 'من إكسل';
    const when = new Date(catalog.updatedAt).toLocaleString('ar-SY-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
    const priced = catalog.items.filter((i) => i.price != null || i.priceUsd != null).length;
    el.innerHTML = `<b class="num">${fmt(catalog.items.length)}</b> صنف ${src} · ${priced ? `<span class="num">${fmt(priced)}</span> مسعّر` : 'بلا أسعار'} · آخر تحديث ${esc(when)}`;
    if (catalog.source !== 'feniq') selectTab(catalog.source === 'demo' ? 'demo' : 'paste');
  }
  const linked = !!(feniqAuth && feniqAuth.refreshToken);
  $('btn-resync').hidden = !linked;
  $('btn-logout').hidden = !linked;
  if (linked) {
    $('btn-login').textContent = 'اربط حساب تاني';
    if (!$('login-msg').textContent) say('login-msg', `مربوط: ${feniqAuth.label || feniqAuth.phone}`, 'ok');
  }
}

// ---------------------------------------------------------------- فينيق

async function ensurePermission() {
  try {
    if (await ext.permissions.contains({ origins: [API_HOST] })) return true;
    return await ext.permissions.request({ origins: [API_HOST] });
  } catch (_) {
    return true; // متصفح يمنح الصلاحية عند التثبيت
  }
}

async function call(base, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base.replace(/\/$/, '') + path, {
    method,
    headers: Object.assign({ Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `السيرفر رجّع ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function withAuth(auth, fn) {
  try {
    return await fn(auth.token);
  } catch (e) {
    if (e.status !== 401 || !auth.refreshToken) throw e;
    const r = await call(auth.base, '/auth/refresh', { method: 'POST', body: { refreshToken: auth.refreshToken } });
    auth.token = r.token;
    auth.refreshToken = r.refreshToken || auth.refreshToken;
    await ext.storage.local.set({ feniqAuth: auth });
    return fn(auth.token);
  }
}

async function syncCatalog(auth, onProgress) {
  const products = [];
  let after = null;
  do {
    const page = await withAuth(auth, (token) => call(auth.base, `/warehouse/products?limit=100${after ? '&after=' + encodeURIComponent(after) : ''}`, { token }));
    products.push(...(page.products || []));
    after = page.pagination && page.pagination.hasMore ? page.pagination.nextCursor : null;
    onProgress(products.length);
  } while (after && products.length < 50000);

  let usdToSyp = null;
  try {
    usdToSyp = (await withAuth(auth, (token) => call(auth.base, '/exchange-rate', { token }))).usdToSyp || null;
  } catch (_) { /* بلا سعر صرف: الأسعار بالدولار تبقى بلا تحويل */ }

  const items = products.map((p) => ({
    id: String(p.id),
    name: p.nameEn || p.nameAr || '',
    nameAr: p.nameAr || '',
    maker: p.manufacturerAr || p.manufacturerEn || '',
    form: p.unitAr || '',
    priceUsd: p.priceUsd,
    price: null,
    available: p.isAvailable !== false && !p.manuallyDisabled,
    bonuses: p.bonuses || [],
  })).filter((i) => i.name);

  await ext.storage.local.set({ catalog: { source: 'feniq', items, usdToSyp, updatedAt: new Date().toISOString() } });
  return { count: items.length, usdToSyp };
}

$('f-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login');
  btn.disabled = true;
  try {
    if (!(await ensurePermission())) throw new Error('لازم تسمح للإضافة توصل لسيرفر فينيق.');
    say('login-msg', 'عم نسجّل الدخول…');
    const base = $('base').value.trim();
    const phone = $('phone').value.trim();
    const r = await call(base, '/auth/login-password', { method: 'POST', body: { phone, password: $('password').value } });
    if (!r.user || r.user.role !== 'warehouse') throw new Error('هالحساب مو حساب مستودع. استعمل رقم المستودع يلي بتفوت فيه على لوحة فينيق.');
    const label = (r.warehouse && (r.warehouse.nameAr || r.warehouse.name)) || r.user.name || phone;
    const auth = { base, phone, label, token: r.token, refreshToken: r.refreshToken };
    await ext.storage.local.set({ feniqAuth: auth });
    $('password').value = '';
    const { settings = {} } = await ext.storage.local.get('settings');
    if (!settings.warehouseName && label) await ext.storage.local.set({ settings: Object.assign({}, DEFAULTS, settings, { warehouseName: label }) });
    const res = await syncCatalog(auth, (n) => say('login-msg', `عم نسحب الأصناف… ${fmt(n)}`));
    say('login-msg', `تمام: ${fmt(res.count)} صنف${res.usdToSyp ? ` · سعر الصرف ${fmt(res.usdToSyp)}` : ''}.`, 'ok');
    await renderStatus();
    await loadSettings();
  } catch (err) {
    say('login-msg', err.message === 'Failed to fetch' ? 'ما قدرنا نوصل للسيرفر. تأكد من الإنترنت (أو الـVPN) وجرّب كمان مرة.' : err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('btn-resync').addEventListener('click', async () => {
  const btn = $('btn-resync');
  btn.disabled = true;
  try {
    const { feniqAuth } = await ext.storage.local.get('feniqAuth');
    const res = await syncCatalog(feniqAuth, (n) => say('login-msg', `عم نسحب الأصناف… ${fmt(n)}`));
    say('login-msg', `تحدّث: ${fmt(res.count)} صنف.`, 'ok');
    await renderStatus();
  } catch (err) {
    say('login-msg', err.status === 401 ? 'انتهت الجلسة، سجّل دخول من جديد.' : err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('btn-logout').addEventListener('click', async () => {
  await ext.storage.local.remove('feniqAuth');
  $('btn-login').textContent = 'اربط واسحب الكتالوج';
  say('login-msg', 'انفصل الحساب. الكتالوج المحفوظ باقي لحتى تبدّله.');
  renderStatus();
});

// ---------------------------------------------------------------- إكسل

let sheetItems = [];
function previewPaste() {
  const { items, columns } = FeniqSheet.parseSheet($('paste').value);
  sheetItems = items;
  const found = Object.keys(columns).map((k) => ({ name: 'الاسم', price: 'السعر', available: 'التوفر', maker: 'الشركة', generic: 'المادة الفعالة', strength: 'العيار', form: 'الشكل' }[k])).join('، ');
  $('paste-preview').textContent = items.length ? `${fmt(items.length)} صنف · أعمدة: ${found}` : '';
  $('btn-paste').disabled = !items.length;
}
$('paste').addEventListener('input', previewPaste);
$('csv').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('paste').value = await f.text();
  previewPaste();
});
$('btn-paste').addEventListener('click', async () => {
  await ext.storage.local.set({ catalog: { source: 'paste', items: sheetItems, usdToSyp: null, updatedAt: new Date().toISOString() } });
  say('paste-msg', `انحفظ ${fmt(sheetItems.length)} صنف.`, 'ok');
  renderStatus();
});

// ---------------------------------------------------------------- تجريبي

$('btn-demo').addEventListener('click', async () => {
  const data = await (await fetch(ext.runtime.getURL('data/demo-catalog.json'))).json();
  const items = data.map((x, i) => ({ id: 'demo-' + i, name: x.n, maker: x.m, generic: x.c, strength: x.s, form: x.f, pack: x.p, price: null, available: true }));
  await ext.storage.local.set({ catalog: { source: 'demo', items, usdToSyp: null, updatedAt: new Date().toISOString() } });
  say('demo-msg', `انحمّل ${fmt(items.length)} صنف. جرّب اللاقط من الزر فوق.`, 'ok');
  renderStatus();
});

// ---------------------------------------------------------------- الرد

async function loadSettings() {
  const { settings = {} } = await ext.storage.local.get('settings');
  const s = Object.assign({}, DEFAULTS, settings);
  $('s-name').value = s.warehouseName;
  $('s-cur').value = s.currency;
  $('s-invite').checked = !!s.inviteOn;
  $('s-link').value = s.inviteLink;
  $('s-link').disabled = !s.inviteOn;
  renderPreview(s);
}

function renderPreview(s) {
  const lines = [
    'أهلاً صيدلية الشفاء، وصلتنا طلبيتك:',
    '• ALLIED SALBUTAMOL SPRAY × 2 = 68,000',
    '• AMBROXOL SYRUP × 10 (+1 بونص) = 85,000',
    '',
    'غير متوفر حالياً: AMARIUM-3 TAB.',
    '',
    `الإجمالي: 153,000 ${s.currency}، والدفع عند التسليم.`,
  ];
  if (s.warehouseName) lines.push(s.warehouseName);
  if (s.inviteOn && s.inviteLink) lines.push('', `المرة الجاية فيك تطلب مباشرة من تطبيق فينيق، وتشوف الأسعار والتوفر لحالك: ${s.inviteLink}`);
  $('preview').textContent = lines.join('\n');
}

let saveTimer = null;
$('f-settings').addEventListener('input', () => {
  const s = { warehouseName: $('s-name').value.trim(), currency: $('s-cur').value.trim() || 'ل.س', inviteOn: $('s-invite').checked, inviteLink: $('s-link').value.trim() };
  $('s-link').disabled = !s.inviteOn;
  renderPreview(s);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await ext.storage.local.set({ settings: s });
    say('s-msg', 'انحفظ', 'ok');
    setTimeout(() => say('s-msg', ''), 1500);
  }, 350);
});
$('f-settings').addEventListener('submit', (e) => e.preventDefault());

// ---------------------------------------------------------------- السجل

async function renderLog() {
  const { orders = [] } = await ext.storage.local.get('orders');
  $('log').innerHTML = orders.length
    ? orders.slice(0, 100).map((o) => `<tr><td>${esc(new Date(o.at).toLocaleString('ar-SY-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</td><td>${esc(o.pharmacy)}</td><td>${esc(o.source)}</td><td>${o.lines.length}</td><td>${o.total ? fmt(o.total) : '—'}</td></tr>`).join('')
    : '<tr><td class="empty" colspan="5">لسا ما في طلبيات. كل رد بتنسخه أو بتحطه بالمحادثة بينحفظ هون.</td></tr>';

  const byPharm = {};
  for (const o of orders) if (o.source === 'واتساب') byPharm[o.pharmacy] = (byPharm[o.pharmacy] || 0) + 1;
  const top = Object.entries(byPharm).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $('pharm').innerHTML = top.length
    ? `<p class="lbl">صيدليات بتطلب منك على الواتساب، أحسن ناس تعرّفهم على تطبيق فينيق:</p>${top.map(([n, c]) => `<span class="p">${esc(n)} <b>${c}</b></span>`).join('')}`
    : '';
}

$('btn-export').addEventListener('click', async () => {
  const { orders = [] } = await ext.storage.local.get('orders');
  const rows = [['التاريخ', 'الصيدلية', 'المصدر', 'الصنف', 'الكمية', 'البونص', 'سعر الوحدة', 'الحالة', 'النص الأصلي']];
  for (const o of orders) for (const l of o.lines) rows.push([o.at, o.pharmacy, o.source, l.name || '', l.qty, l.bonus, l.price ?? '', l.status, l.raw]);
  const csv = '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `feniq-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('btn-clear').addEventListener('click', async () => {
  if (!confirm('أكيد بدك تمسح كل سجل الطلبيات؟ ما في رجعة.')) return;
  await ext.storage.local.set({ orders: [] });
  renderLog();
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.orders) renderLog();
  if (changes.catalog) renderStatus();
});

// ---------------------------------------------------------------- تجربة

$('try').addEventListener('click', () => {
  window.__feniqCatch.open({ text: 'مرحبا، بدي لو سمحت:\n٢ بخاخ سالبوتامول\nامبروكسول شراب 10+1\nالفازار 100 × ٣\nاملاد 5\nفيتامين د 1000 علبتين\nكليكزان 40\nشكراً', pharmacy: 'صيدلية تجريبية' });
});

renderStatus();
loadSettings();
renderLog();
