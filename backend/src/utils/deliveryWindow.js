const { businessDateOf, zonedTimeToInstant, zoneOffsetMs } = require('./businessTime');
const HOUR = 3600000;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
function businessStamp(at) { return new Date(at.getTime() + zoneOffsetMs(at)).toISOString().slice(0, 16).replace('T', ' '); }
function windowAround(expectedAt, now) {
  const from = new Date(Math.max(now.getTime(), expectedAt.getTime() - 12 * HOUR));
  const to = new Date(expectedAt.getTime() + 12 * HOUR);
  return { expectedAt, from, to, expectedBusiness: businessStamp(expectedAt), fromBusiness: businessStamp(from),
    toBusiness: businessStamp(to), timezone: 'Asia/Damascus', marginHours: 12 };
}
// Server calendar only. Equality at cutoff is accepted; readiness may not pass
// departure. One date exception replaces the whole weekly occurrence.
function nextDelivery(zone, now = new Date()) {
  if (!zone?.active) return null;
  const first = Date.parse(`${businessDateOf(now)}T00:00:00Z`);
  for (let offset = 0; offset <= 14 + 7 * (zone.exceptions?.length || 0); offset++) {
    const day = new Date(first + offset * 86400000), date = day.toISOString().slice(0, 10);
    const exception = zone.exceptions?.find((row) => row.date === date);
    if (exception?.cancelled) continue;
    const slot = exception || zone.slots?.find((row) => row.weekday === day.getUTCDay());
    if (!slot || !TIME.test(slot.departureTime)) continue;
    const [hour, minute] = slot.departureTime.split(':').map(Number);
    const departureAt = zonedTimeToInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute);
    const cutoffAt = new Date(departureAt.getTime() - slot.cutoffHours * HOUR);
    if (now > cutoffAt || now.getTime() + zone.preparationHours * HOUR > departureAt.getTime()) continue;
    const expectedAt = new Date(departureAt.getTime() + slot.arrivalHours * HOUR);
    return { ...windowAround(expectedAt, now), departureAt, cutoffAt, dispatchDate: date };
  }
  return null;
}
module.exports = { nextDelivery, windowAround, businessStamp, TIME };
