// Recording a payment by voice, with no AI: the phone or the browser turns
// speech into text, and this reads the text with plain rules - a pharmacy
// name, who paid, how much, how much is left.
//
// The app has the same rules in voice_payment_parser.dart. Both are tested
// against tools/voice-payment/cases.json, so they cannot drift apart.

const WESTERN = '0123456789';
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';

// Lower-case, digits to Western, diacritics and tatweel out, alef/yeh/heh
// variants folded, anything else that isn't a letter, digit or a decimal dot
// turned into a space.
export function normalize(text) {
  let s = String(text ?? '');
  s = s
    .split('')
    .map((c) => {
      let i = ARABIC_INDIC.indexOf(c);
      if (i < 0) i = PERSIAN_INDIC.indexOf(c);
      return i >= 0 ? WESTERN[i] : c;
    })
    .join('');
  s = s.replace(/(\d)[,،٬](?=\d{3})/g, '$1');
  s = s.replace(/[ً-ٰٟـ]/g, '');
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .toLowerCase();
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  s = s.replace(/[^ء-يa-z0-9. ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const UNITS = {
  واحد: 1, وحده: 1, اثنين: 2, اتنين: 2, تنتين: 2, ثنتين: 2, اثنان: 2,
  ثلاثه: 3, تلاته: 3, ثلاث: 3, تلات: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5,
  سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, تمانيه: 8, ثماني: 8, تماني: 8, تمن: 8,
  تسعه: 9, تسع: 9, عشره: 10, عشر: 10,
  احدعش: 11, اطنعش: 12, اثنعش: 12, طنعش: 12, تلطعش: 13, تلتعش: 13, ثلاثعش: 13,
  اربعتعش: 14, خمستعش: 15, ستعش: 16, سبعتعش: 17, تمنتعش: 18, تسعتعش: 19,
  عشرين: 20, ثلاثين: 30, تلاتين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70,
  ثمانين: 80, تمانين: 80, تسعين: 90,
  ميه: 100, مايه: 100, ميتين: 200, ميتان: 200,
  ثلاثميه: 300, تلتميه: 300, تلاتميه: 300, اربعميه: 400, ربعميه: 400, خمسميه: 500,
  ستميه: 600, سبعميه: 700, ثمانميه: 800, تمانميه: 800, تسعميه: 900,
};
// "x thousand" in the singular/dual, and the plural that takes a count.
const THOUSAND = new Set(['الف']);
const THOUSAND_DUAL = new Set(['الفين', 'الفان']);
const THOUSAND_PLURAL = new Set(['الاف', 'تلاف', 'الاف']);
const MILLION = new Set(['مليون']);
const MILLION_DUAL = new Set(['مليونين', 'مليونان']);
const MILLION_PLURAL = new Set(['ملايين']);
const HALF = new Set(['نص', 'نصف']);
const QUARTER = new Set(['ربع']);

const PAID = new Set([
  'دفع', 'دفعت', 'دفعو', 'دفعوا', 'دفعنا', 'دفعلنا', 'ندفع', 'يدفع',
  'سدد', 'سددت', 'سددو', 'سددوا', 'سددنا', 'تسدد', 'يسدد',
  'جاب', 'جابت', 'جابو', 'جابوا', 'جبنا',
  'اعطي', 'اعطت', 'اعطو', 'اعطوا', 'اعطانا', 'اعطتنا',
  'قبضت', 'قبضنا', 'استلمت', 'استلمنا', 'استلم', 'سلم', 'سلمت', 'سلمو', 'سلموا',
  'حول', 'حولت', 'حولو', 'حولوا', 'نزل', 'نزلت', 'نزلو', 'نزلوا',
]);
const FULL_VERBS = new Set([
  'سدد', 'سددت', 'سددو', 'سددوا', 'سددنا', 'تسدد', 'يسدد',
  'خلصت', 'خلص', 'خلصو', 'خلصوا', 'صفت', 'صفيت', 'صفي',
]);
const FULL_WORDS = new Set(['كامل', 'كامله', 'كاملا', 'كلو', 'كله', 'كلها', 'كلهم', 'تماما', 'بالكامل', 'الكل']);
const LEFT = new Set(['ضل', 'ظل', 'بقي', 'بقيت', 'باقي', 'الباقي', 'بيضل', 'ضلت', 'بضل', 'يبقي', 'بيبقي']);
const FILLERS = new Set([
  'و', 'من', 'الي', 'ال', 'لل', 'ل', 'س', 'في', 'علي', 'عن', 'ب', 'كل', 'يعني', 'هلق', 'اليوم', 'لسا', 'بس',
  'علينا', 'عليها', 'عليهم', 'عليه', 'عندنا', 'عندها', 'عندهم', 'المبلغ', 'مبلغ', 'دفعه', 'دفعات', 'الدفعه',
  'حساب', 'الحساب', 'نقدا', 'نقد', 'كاش', 'ليره', 'ليرات', 'سوري', 'سوريه', 'جديده',
  'سجل', 'سجلي', 'سجلو', 'تسجيل', 'اضف', 'ضيف',
]);
const TITLES = new Set([
  'صيدليه', 'الصيدليه', 'صيدلي', 'الصيدلي', 'دكتور', 'الدكتور', 'دكتوره', 'الدكتوره', 'د', 'مركز', 'المركز',
]);

function stripConnector(token, isKnown) {
  if (token.length > 1 && token.startsWith('و') && !isKnown(token) && isKnown(token.slice(1))) return token.slice(1);
  return token;
}

const isNumeric = (t) => /^\d+(\.\d+)?$/.test(t);
const isNumberWord = (t) =>
  t in UNITS || THOUSAND.has(t) || THOUSAND_DUAL.has(t) || THOUSAND_PLURAL.has(t) ||
  MILLION.has(t) || MILLION_DUAL.has(t) || MILLION_PLURAL.has(t) || HALF.has(t) || QUARTER.has(t);
const isMultiplier = (t) =>
  THOUSAND.has(t) || THOUSAND_DUAL.has(t) || THOUSAND_PLURAL.has(t) ||
  MILLION.has(t) || MILLION_DUAL.has(t) || MILLION_PLURAL.has(t);
const isKnownWord = (t) =>
  isNumeric(t) || isNumberWord(t) || PAID.has(t) || LEFT.has(t) || FULL_WORDS.has(t) || FILLERS.has(t) || TITLES.has(t);

// A run of number tokens starting at `start` -> { value, end } (end is the
// index after the run), or null when there is no number there.
function readNumber(tokens, start) {
  let total = 0;
  let current = 0;
  let lastMultiplier = 0;
  let i = start;
  let any = false;
  while (i < tokens.length) {
    let t = tokens[i];
    if (t === 'و') {
      const next = tokens[i + 1];
      if (any && next !== undefined && isNumberLike(next)) {
        i += 1;
        continue;
      }
      break;
    }
    t = stripConnector(t, isNumberLike);
    if (!isNumberLike(t)) break;
    const next = stripConnector(tokens[i + 1] ?? '', isNumberLike);
    if (isNumeric(t)) {
      current += Number(t);
    } else if (t in UNITS) {
      current += UNITS[t];
    } else if (HALF.has(t) || QUARTER.has(t)) {
      const fraction = HALF.has(t) ? 0.5 : 0.25;
      if (isMultiplier(next)) {
        const unit = MILLION.has(next) ? 1e6 : 1000;
        total += fraction * unit;
        lastMultiplier = unit;
        i += 1;
      } else if (lastMultiplier) {
        total += fraction * lastMultiplier;
      } else {
        break;
      }
    } else if (THOUSAND.has(t)) {
      total += (current || 1) * 1000;
      current = 0;
      lastMultiplier = 1000;
    } else if (THOUSAND_DUAL.has(t)) {
      total += 2000;
      current = 0;
      lastMultiplier = 1000;
    } else if (THOUSAND_PLURAL.has(t)) {
      total += (current || 1) * 1000;
      current = 0;
      lastMultiplier = 1000;
    } else if (MILLION.has(t) || MILLION_PLURAL.has(t)) {
      total += (current || 1) * 1e6;
      current = 0;
      lastMultiplier = 1e6;
    } else if (MILLION_DUAL.has(t)) {
      total += 2e6;
      current = 0;
      lastMultiplier = 1e6;
    }
    any = true;
    i += 1;
  }
  if (!any) return null;
  return { value: Math.round(total + current), end: i };
}

function isNumberLike(t) {
  return isNumeric(t) || isNumberWord(t);
}

// text -> { name, kind, paid, left }
//   name: the pharmacy words (normalised), or null
//   kind: 'amount' (a sum was said), 'left' (only what is left), 'full', 'unknown'
export function parseVoicePayment(text) {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const nameTokens = [];
  let paid = null;
  let left = null;
  let afterLeft = false;
  let full = false;
  let i = 0;
  while (i < tokens.length) {
    const raw = tokens[i];
    const t = stripConnector(raw, isKnownWord);
    const number = isNumberLike(t) || (raw === 'و' && isNumberLike(tokens[i + 1] ?? '')) ? readNumber(tokens, i) : null;
    if (number && number.value > 0) {
      if (afterLeft && left === null) left = number.value;
      else if (paid === null) paid = number.value;
      i = number.end;
      continue;
    }
    if (LEFT.has(t)) afterLeft = true;
    else if (FULL_WORDS.has(t) || FULL_VERBS.has(t)) full = true;
    else if (!PAID.has(t) && !FILLERS.has(t) && !TITLES.has(t) && !isNumberLike(t)) nameTokens.push(raw);
    i += 1;
  }
  const kind = paid !== null ? 'amount' : left !== null ? 'left' : full ? 'full' : 'unknown';
  return { name: nameTokens.length ? nameTokens.join(' ') : null, kind, paid, left };
}

// --- matching the spoken name to a pharmacy ---------------------------------

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function nameWords(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !TITLES.has(w))
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w));
}

function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 3) {
    const distance = levenshtein(a, b);
    const allowed = shorter >= 4 && Math.max(a.length, b.length) >= 6 ? 2 : 1;
    if (distance <= allowed) return 1 - distance / Math.max(a.length, b.length);
  }
  if (shorter >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.7;
  return 0;
}

function scoreName(query, nameText) {
  const words = nameWords(nameText);
  if (!query.length || !words.length) return 0;
  const covered = query.reduce((sum, q) => sum + Math.max(...words.map((w) => tokenSimilarity(q, w))), 0);
  const extra = Math.max(0, words.length - query.length);
  return covered / query.length - 0.05 * extra;
}

// The pharmacies a spoken name could mean, best first (at most 3):
// [{ id, score }]. `accounts` are { id, nameAr, nameEn }.
export function matchPharmacies(name, accounts) {
  const query = nameWords(name ?? '');
  if (!query.length) return [];
  return accounts
    .map((account) => ({
      id: account.id,
      score: Math.max(scoreName(query, account.nameAr ?? ''), scoreName(query, account.nameEn ?? '')),
    }))
    .filter((m) => m.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// What to record, given the pharmacy's balance: { paid, left } in whole liras,
// or null when the words don't add up to a payment (nothing said, or more than
// is owed for "all"/"left").
export function paymentFor(parsed, balanceSyp) {
  if (parsed.kind === 'amount') return { paid: parsed.paid, left: Math.max(0, balanceSyp - parsed.paid) };
  if (parsed.kind === 'full' && balanceSyp > 0) return { paid: balanceSyp, left: 0 };
  if (parsed.kind === 'left' && balanceSyp > parsed.left) {
    return { paid: balanceSyp - parsed.left, left: parsed.left };
  }
  return null;
}
