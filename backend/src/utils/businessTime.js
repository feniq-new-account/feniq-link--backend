// The business's own calendar. Feniq trades in Syria, so every "day" a report
// is asked about - a settlement period, a commission window, a statement
// range - is a day in Asia/Damascus, whatever time zone the server runs in.
//
// Why this exists: the panels send a report range as bare dates
// ("2026-09-01" .. "2026-09-25"). `new Date("2026-09-25")` is MIDNIGHT UTC, so
// an end date of today used to cut the range three hours before the Syrian
// day even began - and the default "this month" view left out everything
// delivered today. Here a bare date means the whole local day: a start date is
// its first millisecond, an end date its last.
//
// Offsets come from the ICU time-zone data Node ships (Intl), never a
// hard-coded +03:00 - Syria has changed its rules before, and a DST rule would
// make "the whole day" 23 or 25 hours long.

const BUSINESS_TIME_ZONE = 'Asia/Damascus';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// The business zone's wall-clock reading of an instant, as numbers.
function wallClockOf(instant) {
  const parts = {};
  for (const part of partsFormatter.formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// How far the zone is ahead of UTC at an instant, in ms.
function zoneOffsetMs(instant) {
  const seconds = Math.floor(instant.getTime() / 1000) * 1000;
  const wall = wallClockOf(new Date(seconds));
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtc - seconds;
}

// The instant a local wall-clock time happens in the business zone. The offset
// is looked up twice, so a time next to a DST change lands on the right side.
function zonedTimeToInstant(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstGuess = asUtc - zoneOffsetMs(new Date(asUtc));
  const offset = zoneOffsetMs(new Date(firstGuess));
  return new Date(asUtc - offset);
}

function parseDateOnly(value) {
  const match = typeof value === 'string' ? DATE_ONLY.exec(value.trim()) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Rejects 2026-02-30 and friends rather than rolling them over.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

// The first millisecond of a local business day ("YYYY-MM-DD").
function startOfBusinessDay(dateOnly) {
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  return zonedTimeToInstant(date.year, date.month, date.day);
}

// The last millisecond of a local business day: one before the next day starts,
// so a day is whole even if it is not 24 hours long.
function endOfBusinessDay(dateOnly) {
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return new Date(
    zonedTimeToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()).getTime() - 1
  );
}

// The local business date an instant falls on, as "YYYY-MM-DD".
function businessDateOf(instant = new Date()) {
  const wall = wallClockOf(instant);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

// The first millisecond of the local business month an instant falls in.
function startOfBusinessMonth(instant = new Date()) {
  const wall = wallClockOf(instant);
  return zonedTimeToInstant(wall.year, wall.month, 1);
}

function toInstant(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A report range's start: a bare date is the start of that local business day;
// a full timestamp (or a Date) is taken as the instant it names. null when it
// is neither.
function parseRangeStart(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value.trim())) return startOfBusinessDay(value);
  return toInstant(value);
}

// A report range's end: a bare date is the END of that local business day, so
// "to today" includes all of today.
function parseRangeEnd(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value.trim())) return endOfBusinessDay(value);
  return toInstant(value);
}

module.exports = {
  BUSINESS_TIME_ZONE,
  startOfBusinessDay,
  endOfBusinessDay,
  businessDateOf,
  startOfBusinessMonth,
  parseRangeStart,
  parseRangeEnd,
  zoneOffsetMs,
};
