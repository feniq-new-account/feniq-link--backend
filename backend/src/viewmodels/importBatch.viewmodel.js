// The warehouse import results page: one batch (the header with the per-tab
// counts) and its rows (what the file said, what it was read as, and what
// happened to it).

function serializeBatch(batch) {
  return {
    id: batch._id,
    fileName: batch.fileName ?? null,
    exchangeRateUsed: batch.exchangeRateUsed ?? null,
    counts: {
      added: batch.counts?.added ?? 0,
      updated: batch.counts?.updated ?? 0,
      addedDisabled: batch.counts?.addedDisabled ?? 0,
      blocked: batch.counts?.blocked ?? 0,
      review: batch.counts?.review ?? 0,
      resolved: batch.counts?.resolved ?? 0,
      errors: batch.counts?.errors ?? 0,
    },
    createdAt: batch.createdAt,
  };
}

function serializeRow(row) {
  return {
    id: row._id,
    rowNumber: row.rowNumber,
    bucket: row.bucket,
    raw: {
      name: row.raw?.name ?? null,
      manufacturer: row.raw?.manufacturer ?? null,
      price: row.raw?.price ?? null,
      currency: row.raw?.currency ?? null,
      unit: row.raw?.unit ?? null,
      bonus: row.raw?.bonus ?? null,
    },
    parsed: {
      priceUsd: row.parsed?.priceUsd ?? null,
      currency: row.parsed?.currency ?? null,
      unit: row.parsed?.unit ?? null,
      bonuses: row.parsed?.bonuses ?? null,
    },
    reasons: row.reasons ?? [],
    blockedCode: row.blockedCode ?? null,
    suggestions: (row.suggestions ?? []).map((s) => ({
      masterProductId: s.masterProductId,
      nameAr: s.nameAr,
      manufacturerAr: s.manufacturerAr,
      score: s.score,
    })),
    duplicateOf: row.duplicateOf ?? null,
    masterProductId: row.masterProductId ?? null,
    productId: row.productId ?? null,
    catalogRequestId: row.catalogRequestId ?? null,
    resolvedAt: row.resolvedAt ?? null,
  };
}

module.exports = { serializeBatch, serializeRow };
