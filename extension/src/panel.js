// لوحة «لاقط الطلبيات»: درج جانبي داخل Shadow DOM (كي لا تتأثر بتنسيق الصفحة
// ولا تؤثر عليه). تُحقن في أي صفحة عند الطلب، وتُحمَّل دائماً على واتساب ويب.
(function () {
  'use strict';
  if (window.__feniqCatch) return;

  const ext = globalThis.browser || globalThis.chrome;
  const M = globalThis.FeniqMatcher;
  const isWA = location.hostname === 'web.whatsapp.com';

  const STATUS = {
    ok: { label: 'مطابق', icon: 'check' },
    review: { label: 'راجِع', icon: 'alert' },
    missing: { label: 'مو موجود', icon: 'x' },
    unavailable: { label: 'غير متوفر', icon: 'off' },
  };

  const SAMPLE = 'مرحبا، بدي لو سمحت:\n٢ بخاخ سالبوتامول\nامبروكسول شراب 10+1\nالفازار 100 × ٣\nاملاد 5\nفيتامين د 1000 علبتين\nكليكزان 40\nشكراً';

  const ICONS = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    min: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    off: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M3 3l18 18"/>',
    send: '<path d="M4 12l16-8-6 16-3-7z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    sheet: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
    save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const icon = (name, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- الحالة

  const state = {
    open: false,
    min: false,
    text: '',
    pharmacy: '',
    lines: [],
    overrides: {},
    manual: [],
    pickerFor: null,
    pickerQuery: '',
    catalog: null,
    index: null,
    byId: new Map(),
    settings: {},
  };

  async function loadStore() {
    const got = await ext.storage.local.get(['catalog', 'settings']);
    state.settings = Object.assign({ currency: 'ل.س', inviteOn: true, inviteLink: 'https://feniq-site.onrender.com', warehouseName: '' }, got.settings || {});
    setCatalog(got.catalog || null);
  }

  function setCatalog(catalog) {
    state.catalog = catalog && catalog.items && catalog.items.length ? catalog : null;
    state.index = state.catalog ? M.buildIndex(state.catalog.items) : null;
    state.byId = new Map((state.catalog ? state.catalog.items : []).map((it) => [String(it.id), it]));
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) state.settings = Object.assign(state.settings, changes.settings.newValue || {});
    if (changes.catalog) setCatalog(changes.catalog.newValue);
    if (state.open) { recompute(); renderAll(); }
  });

  const rate = () => (state.catalog && state.catalog.usdToSyp) || null;
  const priceOf = (item) => M.unitPrice(item, rate());

  function recompute() {
    if (!state.index) { state.lines = []; return; }
    const parsed = M.parseOrder(state.text);
    const seen = {};
    state.lines = parsed.map((pl) => {
      // مفتاح ثابت لكل سطر (النص + ترتيب تكراره) كي تبقى تعديلات المستخدم بعد تحرير النص.
      seen[pl.raw] = (seen[pl.raw] || 0) + 1;
      const key = pl.raw + '#' + seen[pl.raw];
      const r = M.matchLine(pl, state.index);
      return applyOverride({
        key, raw: pl.raw, qty: r.qty, bonus: r.bonus, chosen: r.chosen, status: r.status, note: r.note,
        candidates: r.candidates.map((c) => c.item), query: pl.words.join(' '),
      });
    });
    for (const key of state.manual) {
      state.lines.push(applyOverride({ key, raw: '', qty: 1, bonus: 0, chosen: null, status: 'missing', note: '', candidates: [], query: '', manual: true }));
    }
  }

  function applyOverride(line) {
    const o = state.overrides[line.key] || {};
    if (o.itemId && state.byId.has(o.itemId)) {
      line.chosen = state.byId.get(o.itemId);
      line.status = line.chosen.available === false ? 'unavailable' : 'ok';
      line.note = '';
    }
    if (o.qty != null) line.qty = o.qty;
    if (o.bonus != null) line.bonus = o.bonus;
    line.removed = !!o.removed;
    return line;
  }

  const live = () => state.lines.filter((l) => !l.removed);

  function totals() {
    let total = 0;
    let unpriced = 0;
    const counts = { ok: 0, review: 0, missing: 0, unavailable: 0 };
    for (const l of live()) {
      counts[l.status]++;
      if (!l.chosen || l.status === 'unavailable') continue;
      const p = priceOf(l.chosen);
      if (p == null) unpriced++;
      else total += p * l.qty;
    }
    return { total, unpriced, counts };
  }

  // ---------------------------------------------------------------- الواجهة

  const host = document.createElement('feniq-catch');
  host.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483646; inset: auto; top: 0; left: 0; width: 0; height: 0;');
  const root = host.attachShadow({ mode: 'closed' });
  const side = (document.documentElement.dir || document.body?.dir || '').toLowerCase() === 'rtl' ? 'right' : 'left';

  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box}
.wrap{--navy:#16283F;--ground:#0E1A2C;--orange:#F2760A;--orange-deep:#C85A00;--orange-ink:#A94A00;--silver:#E4E7EB;--paper:#F7F7F8;--line:#DCE0E5;--soft:#46566B;--mute:#6B7A8F;--danger:#B42318;
  font-family:FeniqAlexandria,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;color:var(--navy);font-size:14px;line-height:1.5;direction:rtl;-webkit-font-smoothing:antialiased}
button,input,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
::selection{background:#FAD9BC;color:var(--navy)}
.drawer{position:fixed;top:12px;bottom:12px;${side}:12px;width:min(410px,calc(100vw - 24px));display:flex;flex-direction:column;background:var(--paper);border-radius:18px;overflow:hidden;
  box-shadow:0 2px 6px rgba(14,26,44,.18),0 24px 60px -12px rgba(14,26,44,.45);transform:translateX(${side === 'left' ? '-' : ''}calc(100% + 24px));transition:transform .38s cubic-bezier(.16,1,.3,1)}
.drawer.on{transform:none}
.hd{background:var(--navy);color:#fff;display:flex;align-items:center;gap:12px;padding:14px 14px 14px 10px}
.hd img{width:30px;height:36px;object-fit:contain;flex-shrink:0}
.hd .t{flex:1;min-width:0;display:flex;flex-direction:column}
.hd strong{font-size:16px;font-weight:700;letter-spacing:-.01em}
.hd .t span{font-size:12px;color:#B4C2D6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib{width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:inherit;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0}
.hd .ib{color:#B4C2D6}.hd .ib:hover{background:#1D3452;color:#fff}
.body{flex:1;overflow:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin;scrollbar-color:#C9CED6 transparent}
.field{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600;color:var(--soft)}
.field input,.src textarea{width:100%;border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 12px;font-size:14px;color:var(--navy);outline:none;transition:border-color .15s}
.field input:focus,.src textarea:focus{border-color:var(--navy)}
.src{border:1px solid var(--line);background:#fff;border-radius:12px}
.src summary{list-style:none;display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:12px;font-weight:600;color:var(--soft);cursor:pointer}
.src summary::-webkit-details-marker{display:none}
.src summary .n{margin-inline-start:auto;font-weight:500;color:var(--mute)}
.src[open] summary svg{transform:rotate(180deg)}
.src textarea{border:0;border-top:1px solid var(--line);border-radius:0 0 12px 12px;min-height:112px;resize:vertical;line-height:1.7}
.stats{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:8px;font-size:12px;font-weight:600;background:#fff;border:1px solid var(--line)}
.chip.ok{color:var(--navy)}.chip.review{color:var(--orange-ink);border-color:#F6C9A2;background:#FEF3EA}.chip.missing{color:var(--danger);border-color:#F3C7C3;background:#FDF1F0}.chip.unavailable{color:var(--soft)}
ol.lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ln{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;animation:in .32s cubic-bezier(.16,1,.3,1) both}
@keyframes in{from{opacity:0;transform:translateY(6px)}}
.ln.st-review{border-color:#F6C9A2}.ln.st-missing{border-color:#F3C7C3}.ln.st-unavailable{opacity:.72}
.ln-h{display:flex;align-items:center;gap:8px;min-width:0}
.badge{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;flex-shrink:0}
.st-ok .badge{color:var(--navy)}.st-review .badge{color:var(--orange-ink)}.st-missing .badge{color:var(--danger)}.st-unavailable .badge{color:var(--soft)}
.raw{flex:1;min-width:0;font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ln .ib{width:30px;height:30px;color:var(--mute);border-radius:8px}.ln .ib:hover{background:var(--paper);color:var(--danger)}
.pick{display:flex;align-items:center;gap:8px;width:100%;text-align:right;border:1px solid var(--line);background:var(--paper);border-radius:10px;padding:8px 10px}
.pick:hover{border-color:var(--navy)}
.pick .tx{flex:1;min-width:0;display:flex;flex-direction:column}
.nm{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
.nm.ph{color:var(--danger);font-weight:600}
.sub{font-size:11.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.note{margin:0;font-size:12px;color:var(--orange-ink)}
.ln-f{display:flex;align-items:center;gap:10px}
.qty{display:flex;align-items:center;height:34px;border-radius:10px;background:var(--navy);color:#fff}
.qty button{width:32px;height:34px;border:0;background:transparent;display:flex;align-items:center;justify-content:center;padding:0;border-radius:10px}
.qty button:hover{background:#1D3452}
.qty input{width:38px;height:34px;border:0;background:transparent;text-align:center;font-weight:700;font-size:14px;color:#fff;outline:none;font-variant-numeric:tabular-nums}
.bonus{font-size:12px;font-weight:700;color:var(--orange-ink);background:#FEF3EA;border-radius:6px;padding:2px 7px}
.lt{margin-inline-start:auto;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.lt small{font-size:11px;font-weight:500;color:var(--mute)}
.picker{border-top:1px dashed var(--line);padding-top:10px;display:flex;flex-direction:column;gap:8px}
.sbox{display:flex;align-items:center;gap:8px;height:40px;border:1.5px solid var(--navy);border-radius:10px;padding:0 10px;background:#fff;color:var(--soft)}
.sbox input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:14px;color:var(--navy)}
ul.res{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;max-height:236px;overflow:auto}
ul.res button{width:100%;text-align:right;border:0;background:transparent;border-radius:8px;padding:7px 8px;display:flex;flex-direction:column}
ul.res button:hover,ul.res button:focus-visible{background:var(--paper)}
ul.res .nm{font-size:13px}
.empty{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 16px;display:flex;flex-direction:column;gap:10px}
.empty h3{margin:0;font-size:16px;font-weight:700}
.empty p{margin:0;font-size:13px;color:var(--soft);line-height:1.7}
.add{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px dashed #B9BFC7;border-radius:10px;background:transparent;font-size:13px;font-weight:600;color:var(--soft)}
.add:hover{border-color:var(--navy);color:var(--navy)}
.ft{background:#fff;border-top:1px solid var(--line);padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px}
.sum{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.sum span{font-size:12.5px;color:var(--soft)}
.sum strong{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sum strong small{font-size:12px;font-weight:500;color:var(--mute)}
.acts{display:flex;gap:8px}
.btn{height:46px;border-radius:12px;border:1px solid var(--line);background:#fff;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 12px;font-size:13.5px;font-weight:600;color:var(--navy)}
.btn:hover{border-color:var(--navy)}
.btn.pri{flex:1;background:var(--orange);border-color:var(--orange);color:#1A1206;font-weight:700;font-size:14.5px;box-shadow:0 2px 0 var(--orange-deep)}
.btn.pri:hover{background:#F58420}
.btn.pri:active{transform:translateY(1px);box-shadow:0 1px 0 var(--orange-deep)}
.btn.nav{background:var(--navy);border-color:var(--navy);color:#fff}
.btn:disabled{opacity:.45;cursor:not-allowed}
.hint{font-size:11.5px;color:var(--mute);text-align:center}
kbd{font:inherit;font-size:11px;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 4px}
.toast{position:absolute;inset-inline:14px;bottom:128px;background:var(--ground);color:#fff;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;font-size:13px;box-shadow:0 12px 30px -10px rgba(0,0,0,.5);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .3s cubic-bezier(.16,1,.3,1)}
.toast.on{opacity:1;transform:none;pointer-events:auto}
.toast span{flex:1}
.toast button{border:0;background:transparent;color:#FF9A45;font-weight:700}
.pill{position:fixed;bottom:18px;${side}:18px;display:none;align-items:center;gap:10px;height:48px;padding:0 16px 0 10px;border:0;border-radius:24px;background:var(--navy);color:#fff;font-size:14px;font-weight:700;box-shadow:0 10px 30px -8px rgba(14,26,44,.6)}
.pill img{width:24px;height:29px;object-fit:contain}
.pill b{background:var(--orange);color:#1A1206;border-radius:10px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
.pill.on{display:inline-flex}
@media (prefers-reduced-motion:reduce){.drawer,.ln,.toast{transition:none;animation:none}}
</style>
<div class="wrap">
  <aside class="drawer" role="dialog" aria-label="لاقط طلبيات فينيق" aria-hidden="true">
    <header class="hd">
      <img class="mark" alt="">
      <div class="t"><strong>لاقط الطلبيات</strong><span class="cat"></span></div>
      <button class="ib" data-act="settings" aria-label="الإعدادات">${icon('gear')}</button>
      <button class="ib" data-act="min" aria-label="تصغير">${icon('min')}</button>
      <button class="ib" data-act="close" aria-label="إغلاق">${icon('close')}</button>
    </header>
    <div class="body">
      <label class="field">الصيدلية<input class="pharmacy" placeholder="اسم الصيدلية أو رقمها" autocomplete="off"></label>
      <details class="src" open>
        <summary>${icon('chevron', 16)}نص الطلبية<span class="n"></span></summary>
        <textarea class="text" placeholder="الصق هون رسالة الطلبية كما وصلتك، بالعربي أو الإنكليزي" spellcheck="false"></textarea>
      </details>
      <div class="dyn"></div>
    </div>
    <footer class="ft">
      <div class="sum"><span class="sum-l">الإجمالي</span><strong class="sum-v">—</strong></div>
      <div class="acts">
        <button class="btn pri" data-act="reply">${icon(isWA ? 'send' : 'copy')}<span>${isWA ? 'حط الرد بالمحادثة' : 'انسخ الرد للصيدلية'}</span></button>
        <button class="btn" data-act="excel" title="نسخ كجدول يُلصق بإكسل">${icon('sheet')}إكسل</button>
        <button class="btn" data-act="save" title="حفظ بسجل الطلبيات" aria-label="حفظ">${icon('save')}</button>
      </div>
      <div class="hint"><span dir="ltr"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span> للرد السريع · <kbd>Esc</kbd> للإغلاق</div>
    </footer>
    <div class="toast" role="status"><span></span><button hidden>تراجع</button></div>
  </aside>
  <button class="pill" data-act="restore"><img class="mark" alt="">لاقط الطلبيات<b class="pill-n">0</b></button>
</div>`;

  const $ = (sel) => root.querySelector(sel);
  const drawer = $('.drawer');
  const textEl = $('.text');
  const pharmacyEl = $('.pharmacy');
  const dyn = $('.dyn');

  // الخط والشعار: نقرأهما كبيانات (ArrayBuffer / data URL) لأن سياسة CSP في
  // صفحات مثل واتساب قد تمنع تحميلهما من رابط الإضافة مباشرة.
  (async () => {
    try {
      const res = await fetch(ext.runtime.getURL('assets/mark-dark.png'));
      const blob = await res.blob();
      const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
      root.querySelectorAll('img.mark').forEach((img) => { img.src = url; });
    } catch (_) { /* الشعار اختياري */ }
    try {
      for (const [file, range] of [['alexandria-arabic', 'U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF'], ['alexandria-latin', 'U+0000-00FF, U+2000-206F']]) {
        const buf = await (await fetch(ext.runtime.getURL('fonts/' + file + '.woff2'))).arrayBuffer();
        const face = new FontFace('FeniqAlexandria', buf, { weight: '100 900', unicodeRange: range });
        await face.load();
        document.fonts.add(face);
      }
    } catch (_) { /* نرجع لخط النظام */ }
  })();

  // ----------------------------------------------------------------- الرسم

  function renderHeader() {
    const c = state.catalog;
    const src = !c ? 'بلا كتالوج بعد' : c.source === 'feniq' ? 'مربوط بحساب فينيق' : c.source === 'demo' ? 'كتالوج تجريبي' : 'من ملف المستودع';
    $('.cat').textContent = c ? `${c.items.length.toLocaleString('en-US')} صنف · ${src}` : src;
  }

  function lineMeta(item) {
    const p = priceOf(item);
    const parts = [item.maker, M.FORM_LABEL[M.formOfText(item.name) || M.formOfText(item.form || '')] || item.form];
    parts.push(p != null ? `${M.formatMoney(p)} ${state.settings.currency}` : 'بلا سعر');
    if (item.available === false) parts.push('غير متوفر');
    return parts.filter(Boolean).join(' · ');
  }

  function resultsHtml(items) {
    if (!items.length) return '<li class="sub" style="padding:8px">ما في نتائج، جرّب الاسم العلمي أو أول كم حرف.</li>';
    return items.map((it) => `<li><button data-act="choose" data-id="${esc(it.id)}"><span class="nm" dir="ltr">${esc(it.name)}</span><span class="sub">${esc(lineMeta(it))}</span></button></li>`).join('');
  }

  function lineHtml(l) {
    const st = STATUS[l.status];
    const p = l.chosen ? priceOf(l.chosen) : null;
    const total = l.chosen && p != null && l.status !== 'unavailable' ? `${M.formatMoney(p * l.qty)} <small>${esc(state.settings.currency)}</small>` : '<small>—</small>';
    let picker = '';
    if (state.pickerFor === l.key) {
      const items = state.pickerQuery.trim() ? M.search(state.pickerQuery, state.index) : l.candidates;
      picker = `<div class="picker"><label class="sbox">${icon('search', 16)}<input data-act="q" value="${esc(state.pickerQuery)}" placeholder="ابحث بالاسم التجاري أو العلمي" aria-label="بحث عن صنف"></label><ul class="res">${resultsHtml(items)}</ul></div>`;
    }
    return `<li class="ln st-${l.status}" data-key="${esc(l.key)}">
      <div class="ln-h"><span class="badge">${icon(st.icon, 14)}${st.label}</span><span class="raw" title="${esc(l.raw)}">${l.raw ? '«' + esc(l.raw) + '»' : 'سطر مضاف يدوياً'}</span>
        <button class="ib" data-act="del" aria-label="احذف السطر">${icon('trash', 16)}</button></div>
      <button class="pick" data-act="pick" aria-expanded="${state.pickerFor === l.key}">
        <span class="tx">${l.chosen ? `<span class="nm" dir="ltr">${esc(l.chosen.name)}</span><span class="sub">${esc(lineMeta(l.chosen))}</span>` : '<span class="nm ph">اختر الصنف من الكتالوج</span>'}</span>${icon('chevron', 16)}</button>
      ${l.note ? `<p class="note">${esc(l.note)}</p>` : ''}
      <div class="ln-f">
        <div class="qty"><button data-act="inc" aria-label="زيادة">${icon('plus', 15)}</button><input data-act="qty" inputmode="numeric" value="${l.qty}" aria-label="الكمية"><button data-act="dec" aria-label="إنقاص">${icon('minus', 15)}</button></div>
        ${l.bonus ? `<span class="bonus">+${l.bonus} بونص</span>` : ''}
        <span class="lt">${total}</span>
      </div>${picker}</li>`;
  }

  function renderLines() {
    if (!state.catalog) {
      dyn.innerHTML = `<div class="empty"><h3>حمّل كتالوج المستودع أولاً</h3>
        <p>اللاقط يطابق كل سطر بأصنافك وأسعارك. اربط حساب مستودعك على فينيق، أو الصق الأصناف من إكسل، أو جرّب بـ420 صنف حقيقي من السوق السوري.</p>
        <div class="acts"><button class="btn pri" data-act="demo">جرّب بالكتالوج التجريبي</button><button class="btn nav" data-act="settings">اربط المستودع</button></div></div>`;
      return;
    }
    const lines = live();
    if (!state.text.trim() && !lines.length) {
      dyn.innerHTML = `<div class="empty"><h3>الصق رسالة الطلبية</h3>
        <p>على واتساب ويب: مرّر الماوس على رسالة الصيدلية واضغط «لقط الطلبية». بأي صفحة: حدّد النص وكبسة يمين ثم «حوّل لطلبية فينيق».</p>
        <div class="acts"><button class="btn" data-act="sample">جرّب مثال</button></div></div>`;
      return;
    }
    const t = totals();
    const chips = Object.entries(t.counts).filter(([, n]) => n).map(([k, n]) => `<span class="chip ${k}">${icon(STATUS[k].icon, 13)}${n} ${STATUS[k].label}</span>`).join('');
    dyn.innerHTML = `${chips ? `<div class="stats">${chips}</div>` : ''}
      <ol class="lines">${lines.map(lineHtml).join('')}</ol>
      <button class="add" data-act="addline">${icon('plus', 15)}ضيف صنف</button>`;
    const q = dyn.querySelector('input[data-act="q"]');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  function renderFooter() {
    const t = totals();
    const has = live().some((l) => l.chosen);
    const pricedAny = live().some((l) => l.chosen && l.status !== 'unavailable' && priceOf(l.chosen) != null);
    $('.sum-v').innerHTML = pricedAny ? `${M.formatMoney(t.total)} <small>${esc(state.settings.currency)}</small>` : '—';
    $('.sum-l').textContent = has && !pricedAny ? 'الإجمالي · الكتالوج بلا أسعار' : t.unpriced ? `الإجمالي (${t.unpriced} صنف بلا سعر)` : 'الإجمالي · الدفع عند التسليم';
    root.querySelectorAll('.acts [data-act="reply"], .acts [data-act="excel"], .acts [data-act="save"]').forEach((b) => { if (b.closest('.ft')) b.disabled = !has; });
    $('.src .n').textContent = state.text.trim() ? `${M.parseOrder(state.text).length} سطر` : '';
    $('.pill-n').textContent = String(live().length);
  }

  function renderAll() {
    renderHeader();
    renderLines();
    renderFooter();
  }

  // --------------------------------------------------------------- الأفعال

  let toastTimer = null;
  function toast(msg, undo) {
    const el = $('.toast');
    el.querySelector('span').textContent = msg;
    const b = el.querySelector('button');
    b.hidden = !undo;
    b.onclick = undo ? () => { undo(); el.classList.remove('on'); } : null;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 5000 : 2600);
  }

  function setOverride(key, patch) {
    state.overrides[key] = Object.assign({}, state.overrides[key], patch);
    recompute();
    renderLines();
    renderFooter();
  }

  function buildReply() {
    const s = state.settings;
    const cur = s.currency;
    const out = [];
    const name = state.pharmacy.trim();
    out.push(name ? `أهلاً ${name}، وصلتنا طلبيتك:` : 'أهلاً، وصلتنا طلبيتك:');
    const ok = live().filter((l) => l.chosen && l.status !== 'unavailable');
    for (const l of ok) {
      const p = priceOf(l.chosen);
      const b = l.bonus ? ` (+${l.bonus} بونص)` : '';
      out.push(`• ${l.chosen.name} × ${l.qty}${b}${p != null ? ` = ${M.formatMoney(p * l.qty)}` : ''}`);
    }
    const off = live().filter((l) => l.status === 'unavailable' && l.chosen);
    if (off.length) out.push('', `غير متوفر حالياً: ${off.map((l) => l.chosen.name).join('، ')}`);
    const miss = live().filter((l) => !l.chosen && l.raw);
    if (miss.length) out.push('', `ما قدرنا نحدد: ${miss.map((l) => '«' + l.raw + '»').join('، ')}، رح نتواصل معك بخصوصها.`);
    const t = totals();
    const priced = ok.length - t.unpriced;
    if (ok.length && priced > 0) out.push('', `الإجمالي: ${M.formatMoney(t.total)} ${cur}${t.unpriced ? ' (بدون الأصناف غير المسعّرة)' : ''}، والدفع عند التسليم.`);
    else if (ok.length) out.push('', 'منبعتلك الفاتورة مع الطلبية، والدفع عند التسليم.');
    if (s.warehouseName) out.push(`${s.warehouseName}`);
    if (s.inviteOn && s.inviteLink) out.push('', `المرة الجاية فيك تطلب مباشرة من تطبيق فينيق، وتشوف الأسعار والتوفر لحالك: ${s.inviteLink}`);
    return out.join('\n');
  }

  function buildTsv() {
    const rows = [['الصنف', 'الكمية', 'البونص', 'سعر الوحدة', 'الإجمالي', 'الحالة', 'النص الأصلي']];
    for (const l of live()) {
      const p = l.chosen ? priceOf(l.chosen) : null;
      rows.push([l.chosen ? l.chosen.name : '', l.qty, l.bonus || 0, p ?? '', p != null && l.status !== 'unavailable' ? p * l.qty : '', STATUS[l.status].label, l.raw]);
    }
    return rows.map((r) => r.map((c) => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* نجرب الطريقة القديمة */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('style', 'position:fixed;opacity:0;top:0;left:0');
    root.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  async function saveOrder(silent) {
    const t = totals();
    const order = {
      id: 'o' + Date.now().toString(36),
      at: new Date().toISOString(),
      pharmacy: state.pharmacy.trim() || 'بدون اسم',
      source: isWA ? 'واتساب' : location.hostname,
      total: t.total,
      lines: live().map((l) => ({ name: l.chosen ? l.chosen.name : null, raw: l.raw, qty: l.qty, bonus: l.bonus || 0, price: l.chosen ? priceOf(l.chosen) : null, status: l.status })),
    };
    const got = await ext.storage.local.get('orders');
    const orders = [order].concat((got.orders || []).filter((o) => o.id !== state.savedId)).slice(0, 500);
    state.savedId = order.id;
    await ext.storage.local.set({ orders });
    if (!silent) toast('انحفظت الطلبية بالسجل');
  }

  async function reply() {
    if (!live().some((l) => l.chosen)) return;
    const text = buildReply();
    const copied = await copyText(text);
    let inserted = false;
    if (isWA && window.__feniqWA) inserted = window.__feniqWA.insert(text);
    await saveOrder(true);
    toast(inserted ? 'الرد جاهز بخانة الكتابة، راجعه واضغط إرسال' : copied ? 'انسخ الرد، الصقه للصيدلية' : 'ما قدرت انسخ، جرّب مرة تانية');
  }

  async function loadDemo() {
    const items = (await (await fetch(ext.runtime.getURL('data/demo-catalog.json'))).json()).map((x, i) => ({
      id: 'demo-' + i, name: x.n, maker: x.m, generic: x.c, strength: x.s, form: x.f, pack: x.p, price: null, available: true,
    }));
    await ext.storage.local.set({ catalog: { source: 'demo', items, updatedAt: new Date().toISOString(), usdToSyp: null } });
    if (!state.text.trim()) { state.text = SAMPLE; textEl.value = SAMPLE; }
    toast('انحمّل الكتالوج التجريبي (بلا أسعار)');
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const li = btn.closest('.ln');
    const key = li && li.dataset.key;
    const line = key && state.lines.find((l) => l.key === key);
    switch (act) {
      case 'close': close(); break;
      case 'min': state.min = true; drawer.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); $('.pill').classList.add('on'); break;
      case 'restore': state.min = false; $('.pill').classList.remove('on'); drawer.classList.add('on'); drawer.removeAttribute('aria-hidden'); break;
      case 'settings': ext.runtime.sendMessage({ type: 'feniq:options' }); break;
      case 'demo': loadDemo(); break;
      case 'sample': state.text = SAMPLE; textEl.value = SAMPLE; recompute(); renderLines(); renderFooter(); break;
      case 'reply': reply(); break;
      case 'excel': copyText(buildTsv()).then((ok) => toast(ok ? 'انسخ الجدول، الصقه بإكسل' : 'ما قدرت انسخ')); break;
      case 'save': saveOrder(false); break;
      case 'addline': {
        const k = 'manual-' + Date.now().toString(36);
        state.manual.push(k);
        state.pickerFor = k;
        state.pickerQuery = '';
        recompute(); renderLines(); renderFooter();
        break;
      }
      case 'pick':
        if (state.pickerFor === key) { state.pickerFor = null; } else { state.pickerFor = key; state.pickerQuery = line ? line.query : ''; }
        renderLines();
        break;
      case 'choose':
        state.pickerFor = null;
        setOverride(key, { itemId: btn.dataset.id });
        break;
      case 'inc': setOverride(key, { qty: (line.qty || 0) + 1 }); break;
      case 'dec': setOverride(key, { qty: Math.max(1, (line.qty || 1) - 1) }); break;
      case 'del':
        setOverride(key, { removed: true });
        toast('انحذف السطر', () => setOverride(key, { removed: false }));
        break;
      default: break;
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'q') {
      state.pickerQuery = t.value;
      const li = t.closest('.ln');
      const line = state.lines.find((l) => l.key === li.dataset.key);
      const items = t.value.trim() ? M.search(t.value, state.index) : (line ? line.candidates : []);
      li.querySelector('ul.res').innerHTML = resultsHtml(items);
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'qty') {
      const n = parseInt(M.normalize(t.value), 10);
      setOverride(t.closest('.ln').dataset.key, { qty: n > 0 ? n : 1 });
    }
  });

  let debounce = null;
  textEl.addEventListener('input', () => {
    state.text = textEl.value;
    clearTimeout(debounce);
    debounce = setTimeout(() => { recompute(); renderLines(); renderFooter(); }, 220);
  });
  pharmacyEl.addEventListener('input', () => { state.pharmacy = pharmacyEl.value; });

  root.addEventListener('keydown', (e) => {
    e.stopPropagation(); // لا نريد أن تلتقط الصفحة (واتساب) ما نكتبه في اللوحة
    if (e.key === 'Escape') { if (state.pickerFor) { state.pickerFor = null; renderLines(); } else close(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reply(); }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.act === 'q') {
      const first = e.target.closest('.ln').querySelector('ul.res button');
      if (first) first.click();
    }
  }, true);
  ['keyup', 'keypress'].forEach((t) => root.addEventListener(t, (e) => e.stopPropagation(), true));

  // ---------------------------------------------------------------- فتح/إغلاق

  async function open(opts = {}) {
    if (!host.isConnected) document.documentElement.appendChild(host);
    await loadStore();
    const incoming = (opts.text || '').trim() || String(window.getSelection ? window.getSelection() : '').trim();
    if (incoming) {
      state.text = incoming;
      state.overrides = {};
      state.manual = [];
      state.pickerFor = null;
      state.savedId = null;
      textEl.value = incoming;
    }
    if (opts.pharmacy != null) { state.pharmacy = opts.pharmacy; pharmacyEl.value = opts.pharmacy; }
    recompute();
    renderAll();
    state.open = true;
    state.min = false;
    $('.pill').classList.remove('on');
    drawer.removeAttribute('aria-hidden');
    requestAnimationFrame(() => drawer.classList.add('on'));
    if (!incoming && !state.text) setTimeout(() => textEl.focus(), 60);
  }

  function close() {
    state.open = false;
    drawer.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    $('.pill').classList.remove('on');
  }

  ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'feniq:open') {
      open({ text: msg.text || '' });
      sendResponse({ ok: true });
    }
  });

  window.__feniqCatch = { open, close, isOpen: () => state.open };
})();
