const { businessDateOf } = require('./businessTime');
const DAY = 86400000;
const dayNumber = (date) => Date.parse(`${businessDateOf(new Date(date))}T00:00:00Z`) / DAY;

// Payments are account-level, not allocated to invoices. For monitoring we
// settle the oldest remaining debit first. A return reduces its own invoice
// before that allocation. Reversed entries and their originals cancel fully,
// so reversing a recent payment restores the age of the old invoice.
function ageAccount(entries, { overdueDays = 15, now = new Date() } = {}) {
  const reversed = new Set(entries.filter((row) => row.reversalOf).map((row) => String(row.reversalOf)));
  const live = entries.filter((row) => !row.reversalOf && !reversed.has(String(row._id)));
  const lots = live.filter((row) => row.direction === 'debit').map((row) => ({
    id: String(row._id), orderId: row.source?.orderId ? String(row.source.orderId) : null,
    knownAge: row.kind === 'charge', amountSyp: row.amountSyp, at: new Date(row.effectiveAt), sequence: row.sequence,
  })).sort((a, b) => a.at - b.at || a.sequence - b.sequence);
  let pooledCredit = 0;
  for (const row of live.filter((entry) => entry.direction === 'credit')) {
    let remaining = row.amountSyp;
    if (row.kind === 'return_credit' && row.metadata?.orderId) {
      const target = String(row.metadata.orderId);
      for (const lot of lots.filter((item) => item.orderId === target)) {
        const used = Math.min(lot.amountSyp, remaining);
        lot.amountSyp -= used; remaining -= used;
      }
    }
    pooledCredit += remaining;
  }
  const buckets = [0, 0, 0, 0];
  let oldestUnpaidAt = null;
  let overdueSyp = 0, unknownAgeSyp = 0;
  for (const lot of lots) {
    const paid = Math.min(lot.amountSyp, pooledCredit);
    lot.amountSyp -= paid; pooledCredit -= paid;
    if (!lot.amountSyp) continue;
    if (!lot.knownAge) { unknownAgeSyp += lot.amountSyp; continue; }
    const days = Math.max(0, dayNumber(now) - dayNumber(lot.at));
    const index = days < overdueDays ? 0 : days < 2 * overdueDays ? 1 : days < 4 * overdueDays ? 2 : 3;
    buckets[index] += lot.amountSyp;
    if (days >= overdueDays) overdueSyp += lot.amountSyp;
    if (!oldestUnpaidAt) oldestUnpaidAt = lot.at;
  }
  const debtSyp = unknownAgeSyp + buckets.reduce((sum, amount) => sum + amount, 0);
  return { debtSyp, unknownAgeSyp, creditSyp: pooledCredit, overdueSyp, buckets, oldestUnpaidAt,
    oldestAgeDays: oldestUnpaidAt ? Math.max(0, dayNumber(now) - dayNumber(oldestUnpaidAt)) : 0 };
}
module.exports = { ageAccount, dayNumber };
