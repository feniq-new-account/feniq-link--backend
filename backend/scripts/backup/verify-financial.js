// Read-only restore verification. Never rebuilds or silently repairs balances.
async function verifyFinancial(db) {
  const accounts = db.collection('ledgeraccounts');
  const entries = db.collection('ledgerentries');
  const orphan = await entries.aggregate([
    { $lookup: { from: 'ledgeraccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
    { $match: { account: { $size: 0 } } }, { $limit: 1 },
  ]).hasNext();
  if (orphan) throw new Error('Financial verification failed: orphan ledger entry.');
  for await (const account of accounts.find({})) {
    const [sum] = await entries.aggregate([
      { $match: { accountId: account._id } },
      { $group: { _id: null,
        syp: { $sum: { $multiply: ['$amountSyp', { $cond: [{ $eq: ['$direction', 'debit'] }, 1, -1] }] } },
        usd: { $sum: { $multiply: [{ $ifNull: ['$amountUsd', 0] }, { $cond: [{ $eq: ['$direction', 'debit'] }, 1, -1] }] } },
        max: { $max: '$sequence' }, count: { $sum: 1 }, sequences: { $addToSet: '$sequence' },
      } },
    ]).toArray();
    const cached = account.balanceCache || {};
    if ((cached.syp || 0) !== (sum?.syp || 0) || Math.abs((cached.usd || 0) - (sum?.usd || 0)) > 0.005 ||
      (cached.lastEntrySeq || 0) !== (sum?.max || 0) || (account.seqCounter || 0) !== (sum?.max || 0) ||
      (sum && (sum.count !== sum.max || sum.sequences.length !== sum.count))) {
      throw new Error(`Financial verification failed: inconsistent ledger account ${account._id}.`);
    }
  }
  for (const [collection, filter, link] of [
    ['orders', { status: 'delivered' }, 'chargeEntryId'],
    ['payments', {}, 'ledgerEntryId'],
    ['returns', { status: 'approved' }, 'creditEntryId'],
  ]) {
    const missing = await db.collection(collection).aggregate([
      { $match: filter },
      { $lookup: { from: 'ledgerentries', localField: link, foreignField: '_id', as: 'entry' } },
      { $match: { entry: { $size: 0 } } }, { $limit: 1 },
    ]).hasNext();
    if (missing) throw new Error(`Financial verification failed: ${collection} missing its ledger entry.`);
  }
}
module.exports = { verifyFinancial };
