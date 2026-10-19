// The business calendar on the panel side - the counterpart of the backend's
// utils/businessTime.js. Report ranges are whole days in Asia/Damascus: the
// panel sends bare dates ("2026-09-25") and the server reads each as that
// whole local day. So the dates the panel PICKS and SHOWS have to be Damascus
// dates too, whatever time zone the browser is in.
//
// (The pages used to derive their default dates with toISOString(), which is
// the UTC date: between midnight and 03:00 in Damascus "today" was still
// yesterday, and "the 1st of this month" could be the last day of the month
// before.)

export const BUSINESS_TIME_ZONE = 'Asia/Damascus';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function businessParts(instant) {
  const parts = {};
  for (const part of partsFormatter.formatToParts(instant)) parts[part.type] = part.value;
  return parts;
}

// The Damascus date an instant falls on, as an <input type="date"> value.
export function businessDateInputValue(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const { year, month, day } = businessParts(date);
  return `${year}-${month}-${day}`;
}

// The 1st of the Damascus month an instant falls in, as an input value.
export function startOfBusinessMonthInputValue(instant = new Date()) {
  const { year, month } = businessParts(instant);
  return `${year}-${month}-01`;
}

// Every date the panels show reads the same way on every device: day/month/
// year with Western digits ("19/10/2026"), never the browser's locale (which
// gave "10/19/2026, 3:11:14 PM" on an English phone and reversed it in RTL).
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// A stored date shown as the Damascus day it belongs to.
export function formatBusinessDate(value) {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : '';
}

// A recorded-at stamp: the Damascus day and the time, without seconds
// ("19/10/2026 · 15:11").
export function formatBusinessDateTime(value) {
  const date = toDate(value);
  return date ? `${dateFormatter.format(date)} · ${timeFormatter.format(date)}` : '';
}

// ...and the time of day, for a recorded-at stamp.
export function formatBusinessTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormatter.format(date);
}
