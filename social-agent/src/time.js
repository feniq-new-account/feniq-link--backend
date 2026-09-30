// الوقت بتوقيت دمشق: سوريا على UTC+3 طوال السنة منذ 2022 (بلا توقيت صيفي).
const OFFSET_MS = 3 * 60 * 60 * 1000;

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

// تاريخ "محلي" بحقول UTC تساوي وقت دمشق.
function local(ms) {
  return new Date(ms + OFFSET_MS);
}

const pad = (n) => String(n).padStart(2, '0');

// "2026-10-02 19:00"
export function localStamp(ms) {
  const d = local(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// "الخميس 2 تشرين الأول، 7:00 مساءً"
export function humanTime(ms) {
  const d = local(ms);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 12 ? 'صباحاً' : 'مساءً';
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}، ${h12}:${pad(d.getUTCMinutes())} ${part}`;
}

export function localWeekday(ms) {
  return DAYS[local(ms).getUTCDay()];
}

export function localDayIndex(ms) {
  return local(ms).getUTCDay();
}

export function localHour(ms) {
  return local(ms).getUTCHours();
}

export function localDate(ms) {
  return localStamp(ms).slice(0, 10);
}

// يقبل "now" أو "YYYY-MM-DD HH:mm" (أو بحرف T) بتوقيت دمشق. يرجع null إن لم يُفهم.
export function parseLocal(value, nowMs = Date.now()) {
  if (value == null || value === '' || value === 'now') return nowMs;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - OFFSET_MS;
  return Number.isFinite(utc) ? utc : null;
}

// مفتاح الأسبوع (بداية الأحد بتوقيت دمشق) لمنع تكرار المهام الأسبوعية.
export function weekKey(ms) {
  const d = local(ms);
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay());
  return new Date(sunday).toISOString().slice(0, 10);
}
