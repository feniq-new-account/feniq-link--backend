const { displayStatusOf, fundedByFor } = require('../services/discountCode.service');

// One shape for a discount code, for the warehouse panel and the admin panel
// alike. `displayStatus` is what the list badge shows ('active', 'scheduled',
// 'expired', 'exhausted', or the stored 'pending' / 'rejected' / 'stopped');
// `status` is the stored moderation state. `version` is the document version
// the admin's approve/reject/edit is checked against.

function serializeTerms(terms) {
  return {
    type: terms.type,
    value: terms.value,
    startDate: terms.startDate,
    endDate: terms.endDate,
    maxUses: terms.maxUses ?? null,
    maxUsesPerPharmacy: terms.maxUsesPerPharmacy ?? null,
  };
}

function serializeRef(doc) {
  return doc ? { id: String(doc._id), nameAr: doc.nameAr, nameEn: doc.nameEn } : null;
}

function serializeDiscountCode({ codeDoc, pharmacy = null, warehouse = null }, now = new Date()) {
  return {
    id: String(codeDoc._id),
    code: codeDoc.code,
    ownerRole: codeDoc.ownerRole,
    fundedBy: fundedByFor(codeDoc),
    warehouseId: codeDoc.warehouseId ? String(codeDoc.warehouseId) : null,
    warehouse: serializeRef(warehouse),
    scope: codeDoc.pharmacyId ? 'pharmacy' : 'general',
    pharmacyId: codeDoc.pharmacyId ? String(codeDoc.pharmacyId) : null,
    pharmacy: serializeRef(pharmacy),
    ...serializeTerms(codeDoc),
    usedCount: codeDoc.usedCount ?? 0,
    status: codeDoc.status,
    displayStatus: displayStatusOf(codeDoc, now),
    revision: codeDoc.revision,
    version: codeDoc.__v ?? 0,
    pendingUpdate: codeDoc.pendingUpdate
      ? { ...serializeTerms(codeDoc.pendingUpdate), requestedAt: codeDoc.pendingUpdate.requestedAt ?? null }
      : null,
    rejectionNote: codeDoc.rejectionNote ?? null,
    rejectedAt: codeDoc.rejectedAt ?? null,
    approvedAt: codeDoc.approvedAt ?? null,
    stoppedAt: codeDoc.stoppedAt ?? null,
    stoppedByRole: codeDoc.stoppedByRole ?? null,
    createdAt: codeDoc.createdAt,
    updatedAt: codeDoc.updatedAt,
  };
}

function toDiscountCodeListResponse(rows) {
  const now = new Date();
  return { discountCodes: rows.map((row) => serializeDiscountCode(row, now)) };
}

function toDiscountCodeResponse(codeDoc, refs = {}) {
  return { discountCode: serializeDiscountCode({ codeDoc, ...refs }) };
}

// The cart quote (POST /discount-codes/preview): the totals the app's summary
// shows, so its lines add up exactly - and, when a code was given, the code's
// terms (`revision` goes back with the order). `discountCode` is null on a
// cart quoted without one.
function toPreviewResponse(quote) {
  return {
    discountCode: quote.code
      ? {
          code: quote.code,
          type: quote.type,
          value: quote.value,
          revision: quote.revision,
          fundedBy: quote.fundedBy,
        }
      : null,
    totals: {
      subtotalSyp: quote.subtotalSyp,
      platformDiscountSyp: quote.platformDiscountSyp,
      // The warehouse's loyalty discount for a cart this size, the pharmacy's
      // credit at this warehouse, and the part of it this order takes.
      loyaltyDiscountSyp: quote.loyaltyDiscountSyp ?? 0,
      creditBalanceSyp: quote.creditBalanceSyp ?? 0,
      creditUsedSyp: quote.creditUsedSyp ?? 0,
      preCodeSyp: quote.preCodeSyp,
      discountSyp: quote.discountSyp,
      discountUsd: quote.discountUsd,
      finalSyp: quote.finalSyp,
      usdToSyp: quote.usdToSyp,
    },
  };
}

// The discount-code line on an order, for the order screens and the invoice.
// The pharmacy sees the code and what it took off; the warehouse also sees who
// pays for it and what the platform owes it for this order. null on an order
// placed without a code.
function serializeOrderDiscountCode(snapshot, { forWarehouse = false } = {}) {
  if (!snapshot) return null;
  const line = {
    code: snapshot.code,
    type: snapshot.type,
    value: snapshot.value,
    discountSyp: snapshot.discountSyp,
    discountUsd: snapshot.discountUsd ?? null,
    released: Boolean(snapshot.releasedAt),
  };
  if (!forWarehouse) return line;
  return {
    ...line,
    ownerRole: snapshot.ownerRole,
    fundedBy: snapshot.fundedBy,
    preCodeSyp: snapshot.preCodeSyp,
    platformCompensationSyp: snapshot.platformCompensationSyp ?? 0,
    releasedAt: snapshot.releasedAt ?? null,
    releaseReason: snapshot.releaseReason ?? null,
  };
}

module.exports = {
  serializeOrderDiscountCode,
  serializeDiscountCode,
  toDiscountCodeListResponse,
  toDiscountCodeResponse,
  toPreviewResponse,
};
