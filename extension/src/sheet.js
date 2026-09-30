// قراءة أصناف ملصوقة من إكسل (TSV) أو CSV، مع التعرّف على الأعمدة من سطر
// العناوين بالعربي أو الإنكليزي.
(function (root) {
  'use strict';

  const COLS = {
    name: /(^|\s)(name|item|product|trade|اسم|الاسم|الصنف|صنف|الماده التجاريه|الاسم التجاري)(\s|$)/,
    price: /(price|سعر|السعر|ل\.?س|syp|usd|\$)/,
    available: /(avail|stock|متوفر|التوفر|متاح|الحاله)/,
    maker: /(maker|manufacturer|company|brand|الشركه|شركه|المصنع|المعمل)/,
    generic: /(generic|scientific|active|composition|العلمي|الماده الفعاله|التركيب|الماده)/,
    strength: /(strength|dose|العيار|التركيز)/,
    form: /(form|dosage|الشكل|الشكل الصيدلاني)/,
  };

  function norm(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
  }

  function splitRow(line, delim) {
    if (delim === '\t') return line.split('\t');
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseNumber(v) {
    const s = norm(v).replace(/[^\d.,]/g, '');
    if (!s) return null;
    const n = Number(s.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  function parseAvailable(v) {
    const s = norm(v);
    if (!s) return true;
    if (/^(0|no|false|n|لا|غير|غير متوفر|مقطوع|نافد|x)$/.test(s) || /غير|مقطوع|نافد/.test(s)) return false;
    const n = Number(s);
    if (isFinite(n)) return n > 0;
    return true;
  }

  function parseSheet(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (!lines.length) return { items: [], columns: {} };
    const delim = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
    const rows = lines.map((l) => splitRow(l, delim).map((c) => c.trim()));

    const head = rows[0].map(norm);
    const columns = {};
    for (const [key, re] of Object.entries(COLS)) {
      const i = head.findIndex((h, idx) => re.test(h) && !Object.values(columns).includes(idx));
      if (i >= 0) columns[key] = i;
    }
    let body = rows;
    if (columns.name != null) body = rows.slice(1);
    else {
      // بلا عناوين: العمود الأول اسم، وأول عمود رقمي بعده سعر.
      columns.name = 0;
      const sample = rows[0];
      const pi = sample.findIndex((c, i) => i > 0 && parseNumber(c) != null);
      if (pi > 0) columns.price = pi;
    }

    const items = [];
    body.forEach((r, i) => {
      const name = (r[columns.name] || '').trim();
      if (!name) return;
      items.push({
        id: 'sheet-' + i,
        name,
        price: columns.price != null ? parseNumber(r[columns.price]) : null,
        available: columns.available != null ? parseAvailable(r[columns.available]) : true,
        maker: columns.maker != null ? r[columns.maker] : '',
        generic: columns.generic != null ? r[columns.generic] : '',
        strength: columns.strength != null ? r[columns.strength] : '',
        form: columns.form != null ? r[columns.form] : '',
      });
    });
    return { items, columns };
  }

  const api = { parseSheet };
  root.FeniqSheet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
