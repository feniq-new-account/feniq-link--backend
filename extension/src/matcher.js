// محرّك لاقط الطلبيات: يحوّل نص طلبية حرّ (عربي، إنكليزي، أو خليط كما تكتبه
// الصيدليات على واتساب) إلى أسطر فيها كمية وصنف من كتالوج المستودع.
//
// الفكرة الأساسية: الصيدلاني يكتب «امبروكسول شراب ٣» والكتالوج فيه
// «AMBROXOL SYRUP». لا يوجد حرف مشترك، لذلك نقارن «الهيكل الصوتي» للكلمة:
// نحوّل الطرفين إلى حروف ساكنة لاتينية مبسّطة (mbrksl) ونقارنها.
//
// ملف واحد بلا اعتماديات، يعمل في صفحة المحتوى وصفحة الإعدادات و Node
// (للاختبارات)، لذلك يصدّر نفسه على globalThis وعلى module.exports.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- تطبيع

  const AR_DIGITS = /[٠-٩۰-۹]/g;
  const TASHKEEL = /[ً-ٰٟـ]/g;

  function toWesternDigits(s) {
    return s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) & 0xf));
  }

  function normalize(s) {
    return toWesternDigits(String(s || ''))
      .replace(TASHKEEL, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[×✕✖]/g, 'x')
      .replace(/٫/g, '.')
      .replace(/٬/g, ',')
      .toLowerCase();
  }

  // ------------------------------------------------------- الهيكل الصوتي

  const AR_MAP = {
    'ب': 'b', 'پ': 'b', 'ت': 't', 'ث': 's', 'ج': 'g', 'چ': 'g', 'گ': 'g', 'ح': '', 'خ': 'k',
    'د': 'd', 'ذ': 's', 'ر': 'r', 'ز': 's', 'س': 's', 'ش': 's', 'ص': 's', 'ض': 'd',
    'ط': 't', 'ظ': 's', 'ع': '', 'غ': 'g', 'ف': 'f', 'ڤ': 'f', 'ق': 'k', 'ك': 'k', 'ک': 'k',
    'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': '', 'و': '', 'ي': '', 'ی': '', 'ا': '', 'ء': '',
  };

  // كلمة واحدة (بعد normalize) → حروف ساكنة لاتينية. p→b لأن العربية بلا P
  // (بنادول = Panadol)، v→f، z→s، والأحرف الصوتية تسقط من الطرفين.
  function skeleton(word) {
    let s = String(word || '');
    if (/[a-z]/.test(s)) {
      s = s
        .replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'k').replace(/ck/g, 'k')
        .replace(/sh/g, 's').replace(/kh/g, 'k').replace(/gh/g, 'g')
        .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
        .replace(/z/g, 's').replace(/v/g, 'f').replace(/p/g, 'b').replace(/j/g, 'g')
        .replace(/[whaeiouy]/g, '');
    }
    s = s.replace(/[؀-ۿ]/g, (ch) => (AR_MAP[ch] !== undefined ? AR_MAP[ch] : ''));
    return s.replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[b.length];
  }

  function sim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    // اختصار: «امبروكس» يكفي لـ AMBROXOL.
    if (a.length >= 3 && b.startsWith(a)) return Math.max(0.86, 1 - (b.length - a.length) * 0.025);
    if (b.length >= 3 && a.startsWith(b)) return 0.8;
    const m = Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) > Math.max(3, m / 2)) return 0;
    return 1 - lev(a, b) / m;
  }

  // -------------------------------------------------------------- القواميس

  const FORMS = {
    syrup: ['شراب', 'سيروب', 'سيرب', 'معلق', 'syrup', 'syr', 'susp', 'suspension'],
    tab: ['حب', 'حبوب', 'حبه', 'اقراص', 'قرص', 'مضغوط', 'مضغوطات', 'ملبسه', 'tab', 'tabs', 'tablet', 'tablets', 'ctd', 'ctdtab', 'fctab', 'caplet', 'caplets'],
    cap: ['كبسول', 'كبسولات', 'كبسوله', 'كابسول', 'محافظ', 'محفظه', 'cap', 'caps', 'capsule', 'capsules'],
    spray: ['بخاخ', 'بخه', 'بخاخه', 'بخات', 'spray', 'inhaler', 'aerosol'],
    amp: ['ابر', 'ابره', 'امبول', 'امبولات', 'حقن', 'حقنه', 'فيال', 'amp', 'amps', 'ampoule', 'ampoules', 'inj', 'injection', 'vial', 'vials'],
    drops: ['نقط', 'نقاط', 'قطره', 'قطرات', 'drop', 'drops', 'gtt'],
    cream: ['كريم', 'cream'],
    oint: ['مرهم', 'مراهم', 'oint', 'ointment'],
    gel: ['جل', 'جيل', 'gel'],
    supp: ['تحاميل', 'تحميله', 'لبوس', 'شياف', 'supp', 'supps', 'suppository', 'suppositories'],
    sachet: ['اكياس', 'كيس', 'ظروف', 'فوار', 'sachet', 'sachets', 'eff', 'effervescent'],
  };
  const FORM_LABEL = {
    syrup: 'شراب', tab: 'أقراص', cap: 'كبسول', spray: 'بخاخ', amp: 'أمبولات', drops: 'نقط',
    cream: 'كريم', oint: 'مرهم', gel: 'جل', supp: 'تحاميل', sachet: 'أكياس',
  };
  const FORM_OF = new Map();
  for (const [k, words] of Object.entries(FORMS)) for (const w of words) FORM_OF.set(normalize(w), k);

  const NUM_WORDS = new Map(Object.entries({
    'واحد': 1, 'وحده': 1, 'اثنين': 2, 'اتنين': 2, 'تنين': 2, 'ثنتين': 2, 'تنتين': 2, 'زوج': 2,
    'ثلاث': 3, 'تلات': 3, 'ثلاثه': 3, 'تلاته': 3, 'اربع': 4, 'اربعه': 4, 'خمس': 5, 'خمسه': 5,
    'ست': 6, 'سته': 6, 'سبع': 7, 'سبعه': 7, 'ثمان': 8, 'ثماني': 8, 'ثمانيه': 8, 'تمن': 8,
    'تماني': 8, 'تمانيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10, 'دزينه': 12,
    'عشرين': 20, 'ثلاثين': 30, 'تلاتين': 30, 'اربعين': 40, 'خمسين': 50, 'ميه': 100, 'مئه': 100,
  }));

  const PACK_WORDS = ['علبه', 'علب', 'باكيت', 'باكيتات', 'كرتونه', 'كراتين', 'قطعه', 'قطع', 'عبوه', 'عبوات',
    'شريط', 'شرايط', 'فرط', 'box', 'boxes', 'pcs', 'pc', 'pack', 'packs', 'pkt'];
  const PACK_DUALS = ['علبتين', 'كرتونتين', 'باكيتين', 'قطعتين', 'عبوتين', 'شريطين'];
  const PACK_RE = PACK_WORDS.map(normalize).join('|');

  const STRENGTH_UNITS = '(?:mg|mcg|µg|ug|g|gm|ml|iu|u|%|ملغ|مغ|ملغم|ملغرام|ميلي|مل|غ|غرام|ميكرو)';

  const STOP = new Set(['بدي', 'بدنا', 'بدو', 'اريد', 'نريد', 'لو', 'سمحت', 'سمحتو', 'من', 'فضلك', 'فضلكم',
    'ابعتلي', 'ابعتلنا', 'ابعت', 'ابعتو', 'ارسل', 'ارسلو', 'بعتلي', 'بعتلنا', 'جيبلي', 'جيبولي', 'الله',
    'يعطيك', 'يعطيكم', 'العافيه', 'مرحبا', 'اهلا', 'السلام', 'عليكم', 'صباح', 'مسا', 'مساء', 'الخير',
    'please', 'pls', 'plz', 'hi', 'hello', 'و', 'مع', 'كمان', 'عندكن', 'عندكم', 'عندك', 'في', 'فيه', 'بس',
    'طلبيه', 'الطلبيه', 'طلب', 'صيدليه', 'الصيدليه', 'شكرا', 'تسلم', 'تسلمو', 'اذا', 'ممكن', 'لنا', 'الي',
    'لي', 'هي', 'هاد', 'هدول', 'عدد', 'العدد', 'كميه', 'الكميه', 'order', 'need', 'the', 'and']);

  // «20.000IU» بالكتابة السورية = عشرون ألف، لا عشرون فاصلة صفر.
  function numbersIn(text) {
    const out = [];
    const re = /\d+(?:[.,]\d+)?/g;
    let m;
    while ((m = re.exec(text))) {
      let v = m[0];
      if (/^\d{1,3}[.,]\d{3}$/.test(v)) v = v.replace(/[.,]/, '');
      else v = v.replace(',', '.');
      out.push(String(Number(v)));
    }
    return out;
  }

  // ------------------------------------------------------------ تقطيع النص

  function splitLines(text) {
    return normalize(text)
      .split(/\r?\n|،|؛|;|,(?!\d{3}\b)/)
      .flatMap((l) => l.split(/\s+و\s*(?=\d)|\s+و(?=\s*(?:x|\*)?\d)/))
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function parseLine(raw) {
    let s = ' ' + normalize(raw) + ' ';
    s = s.replace(/^\s*[-–—•*·●▪►>]+\s*/, ' ');
    s = s.replace(/^\s*\d{1,2}\s*[).]\s+(?=\S)/, ' '); // «1) ...» ترقيم لا كمية

    let qty = null;
    let bonus = 0;
    let qtyExplicit = false;
    const take = (re, fn) => {
      s = s.replace(re, (...m) => { fn(...m); return ' '; });
    };

    // 10+1 → كمية 10 وبونص 1
    take(/(\d+)\s*\+\s*(\d+)(?!\s*(?:mg|ml|مغ|ملغ))/, (_, a, b) => { qty = +a; bonus = +b; qtyExplicit = true; });
    if (qty == null) take(/(?:^|\s)(?:x|\*)\s*(\d+)(?=\s|$)/, (_, n) => { qty = +n; qtyExplicit = true; });
    if (qty == null) take(/(?:^|\s)(\d+)\s*(?:x|\*)(?=\s|$)/, (_, n) => { qty = +n; qtyExplicit = true; });
    if (qty == null) take(new RegExp('(\\d+)\\s*(?:' + PACK_RE + ')(?=\\s|$)'), (_, n) => { qty = +n; qtyExplicit = true; });
    if (qty == null) take(/(?:^|\s)(?:عدد|كميه|qty)\s*:?\s*(\d+)(?=\s|$)/, (_, n) => { qty = +n; qtyExplicit = true; });
    for (const d of PACK_DUALS) {
      const re = new RegExp('(?:^|\\s)' + normalize(d) + '(?=\\s|$)');
      if (re.test(s)) { s = s.replace(re, ' '); if (qty == null) { qty = 2; qtyExplicit = true; } }
    }
    s = s.replace(new RegExp('(?:^|\\s)(?:' + PACK_RE + ')(?=\\s|$)', 'g'), ' ');

    // العيار: رقم متبوع بوحدة (500mg، 5 مغ).
    const strengths = [];
    s = s.replace(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*' + STRENGTH_UNITS + '(?:\\/\\S*)?(?=\\s|$|[^a-z\\u0600-\\u06ff])', 'g'), (_, n) => {
      strengths.push(...numbersIn(n));
      return ' ';
    });

    let words = s.split(/[^a-z0-9؀-ۿ.]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);

    // كمية بالكلمات («تنين بنادول»).
    if (qty == null) {
      const i = words.findIndex((w) => NUM_WORDS.has(w));
      if (i >= 0) { qty = NUM_WORDS.get(words[i]); qtyExplicit = true; words.splice(i, 1); }
    }

    let form = null;
    words = words.filter((w) => {
      const f = FORM_OF.get(w);
      if (f) { form = form || f; return false; }
      return true;
    });

    // رقم عارٍ في البداية = كمية («3 بنادول»). في النهاية غامض: عيار أم كمية؟
    // نترك القرار للمطابقة (matchLine) لأنها تعرف أعيار الصنف.
    let trailing = null;
    const isNum = (w) => /^\d+(?:[.,]\d+)?$/.test(w);
    if (qty == null && words.length > 1 && isNum(words[0])) { qty = +words[0]; qtyExplicit = true; words.shift(); }
    if (words.length > 1 && isNum(words[words.length - 1])) trailing = numbersIn(words[words.length - 1])[0];

    const numbers = strengths.slice();
    const nameWords = [];
    for (const w of words) {
      if (isNum(w)) { if (numbersIn(w)[0] !== trailing) numbers.push(...numbersIn(w)); continue; }
      if (STOP.has(w)) continue;
      nameWords.push(w);
    }
    if (!nameWords.length) return null; // تحية أو سطر بلا صنف

    return {
      raw: String(raw).trim(),
      qty: qty == null ? 1 : qty,
      qtyExplicit,
      bonus,
      form,
      numbers,
      trailing,
      words: nameWords,
      skels: nameWords.map(skeleton).filter((k) => k.length >= 2),
    };
  }

  function parseOrder(text) {
    return splitLines(text).map(parseLine).filter(Boolean);
  }

  // ------------------------------------------------------------- الكتالوج

  function formOfText(text) {
    for (const w of normalize(text).split(/[^a-z0-9؀-ۿ]+/)) {
      const f = FORM_OF.get(w);
      if (f) return f;
    }
    return null;
  }

  const NOISE = new Set(['tab', 'tabs', 'ctd', 'cap', 'caps', 'f', 'c', 'e', 's', 'sr', 'mr', 'er', 'xr', 'dt', 'od', 'enteric', 'coated', 'film', 'forte', 'plus']);

  function prepareItem(it) {
    const name = normalize(it.name || it.nameAr || '');
    const toks = name.split(/[^a-z0-9؀-ۿ]+/).filter(Boolean);
    const brand = toks.filter((t) => !/^\d/.test(t) && !FORM_OF.has(t) && !NOISE.has(t)).map(skeleton).filter((k) => k.length >= 2);
    const nameAr = it.nameAr && it.nameAr !== it.name ? normalize(it.nameAr) : '';
    const arToks = nameAr ? nameAr.split(/[^a-z0-9؀-ۿ]+/).filter((t) => t && !FORM_OF.has(t) && !/^\d/.test(t)).map(skeleton).filter((k) => k.length >= 2) : [];
    const generic = normalize(it.generic || '').split(/[^a-z0-9]+/).filter((t) => t.length > 2).map(skeleton).filter((k) => k.length >= 2);
    const nums = new Set(numbersIn(name + ' ' + normalize(it.strength || '') + ' ' + nameAr));
    return {
      item: it,
      brand,
      arToks,
      generic,
      nums,
      form: formOfText(name) || formOfText(it.form || '') || formOfText(nameAr),
    };
  }

  function buildIndex(items) {
    return { entries: (items || []).map(prepareItem), size: (items || []).length };
  }

  function fieldScore(qs, toks) {
    if (!qs.length || !toks.length) return 0;
    let sum = 0;
    let w = 0;
    for (const q of qs) {
      let best = 0;
      for (const t of toks) { const v = sim(q, t); if (v > best) best = v; }
      sum += best * q.length;
      w += q.length;
    }
    const avg = sum / w;
    const joined = sim(qs.join(''), toks.slice(0, Math.max(qs.length, 1)).join(''));
    // الكلمة الأولى في اسم الصنف هي الماركة: إن لم يقترب منها شيء فالمطابقة ضعيفة.
    let head = 0;
    for (const q of qs) head = Math.max(head, sim(q, toks[0]));
    let s = Math.max(avg, joined);
    // كلمات في اسم الصنف لم يذكرها أحد: «AMBROXOL SYRUP» أقرب لـ«امبروكسول»
    // من «AMBROXOL CITY PHARMA SYRUP».
    const extra = toks.filter((t) => !qs.some((q) => sim(q, t) >= 0.6)).length;
    s -= Math.min(0.09, extra * 0.03);
    return head < 0.6 ? s * 0.8 : s;
  }

  function scoreEntry(q, e, numbers) {
    const byName = Math.max(fieldScore(q.skels, e.brand), fieldScore(q.skels, e.arToks));
    const byGeneric = fieldScore(q.skels, e.generic) * 0.85;
    let s = Math.max(byName, byGeneric);
    if (s < 0.35) return s;
    if (numbers.length) {
      const hit = numbers.some((n) => e.nums.has(n));
      if (hit) s += 0.08;
      else if (e.nums.size) s -= 0.12;
    }
    if (q.form && e.form) s += q.form === e.form ? 0.06 : -0.12;
    // مطابقة بالمادة الفعالة وحدها لا تتفوّق على صنف ذُكر اسمه التجاري.
    if (byGeneric > byName) s = Math.min(s, 0.9);
    return s; // بلا سقف هنا كي لا يتساوى صنفان عند 1، السقف عند العرض فقط
  }

  function rank(q, index, numbers, limit) {
    const out = [];
    for (const e of index.entries) {
      const score = scoreEntry(q, e, numbers);
      if (score >= 0.45) out.push({ entry: e, score });
    }
    out.sort((a, b) => b.score - a.score || (b.entry.item.available === false ? -1 : 0));
    return out.slice(0, limit);
  }

  // النتيجة: الصنف المختار + بدائل + حالة (ok | review | missing | unavailable).
  function matchLine(line, index, limit = 6) {
    let qty = line.qty;
    let numbers = line.numbers.slice();
    let ranked = rank(line, index, numbers, limit);
    let note = '';

    if (line.trailing != null) {
      const asStrength = rank(line, index, numbers.concat(line.trailing), limit);
      const top = asStrength[0];
      if (top && top.entry.nums.has(line.trailing)) {
        ranked = asStrength;
        numbers = numbers.concat(line.trailing);
      } else if (!line.qtyExplicit) {
        qty = +line.trailing;
      } else {
        ranked = asStrength;
      }
    }

    const cands = ranked.map((r) => ({ item: r.entry.item, score: Math.round(Math.min(1, r.score) * 100) / 100, form: r.entry.form }));
    const top = cands[0];
    let status = 'missing';
    if (top) {
      const gap = ranked[1] ? ranked[0].score - ranked[1].score : 1;
      const topScore = ranked[0].score;
      if (topScore >= 0.8 && gap >= 0.04) status = 'ok';
      else if (topScore >= 0.7) status = 'review';
      if (topScore >= 0.8 && gap < 0.04) note = 'في أكثر من عيار أو شكل قريب، تأكد من الصنف';
      if (status !== 'missing' && top.item.available === false) status = 'unavailable';
    }
    return { line, qty, bonus: line.bonus, candidates: cands, chosen: status === 'missing' ? null : top.item, status, note };
  }

  function search(text, index, limit = 8) {
    const q = parseLine(text) || { skels: [], form: null, numbers: [] };
    if (!q.skels.length) return [];
    const nums = q.trailing != null ? q.numbers.concat(q.trailing) : q.numbers;
    return rank(q, index, nums, limit).map((r) => r.entry.item);
  }

  // ------------------------------------------------------------- أدوات عامة

  function formatMoney(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function unitPrice(item, rate) {
    if (!item) return null;
    if (item.price != null && isFinite(item.price)) return +item.price;
    if (item.priceUsd != null && rate) return Math.round(item.priceUsd * rate);
    return null;
  }

  const api = {
    normalize, skeleton, sim, lev, parseLine, parseOrder, splitLines, buildIndex, matchLine, search,
    formatMoney, unitPrice, numbersIn, FORM_LABEL, formOfText,
  };
  root.FeniqMatcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
