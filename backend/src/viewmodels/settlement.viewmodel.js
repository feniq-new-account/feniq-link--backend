// Money-Flow V2. The warehouse's settlement report: what it sold, what came
// back, what the platform is owed, and what it keeps.
//
// Every figure is SYP - the settlement currency - and every one of them is a
// sum of frozen per-order values, never a live re-conversion. The vocabulary
// is kept strictly separate: SALES is what pharmacies were charged, not what
// was collected in cash (that is the account balance's job); COMMISSION is
// what the platform is owed, not a discount; COMPENSATION is what the platform
// owes the warehouse for admin discount codes; NET is what the warehouse keeps.
function serializeSettlementRow(row) {
  return {
    orderId: row.orderId,
    ...(row.commissionEngine === 'collection_v2' ? { commissionEngine: row.commissionEngine, commissionPotentialSyp: row.commissionPotentialSyp } : {}),
    orderNumber: row.orderNumber,
    invoiceNumber: row.invoiceNumber,
    deliveredAt: row.deliveredAt,
    subtotalSyp: row.subtotalSyp,
    platformDiscountSyp: row.platformDiscountSyp,
    advertisementDiscountSyp: row.advertisementDiscountSyp,
    discountCode: row.discountCode ?? null,
    discountCodeSyp: row.discountCodeSyp ?? 0,
    discountCodeFundedBy: row.discountCodeFundedBy ?? null,
    salesSyp: row.salesSyp,
    commissionSyp: row.commissionSyp,
    creditedSyp: row.creditedSyp,
    commissionClawbackSyp: row.commissionClawbackSyp,
    // What the platform owes the warehouse for an admin discount code.
    platformCompensationSyp: row.platformCompensationSyp ?? 0,
    compensationClawbackSyp: row.compensationClawbackSyp ?? 0,
    netCompensationSyp: row.netCompensationSyp ?? 0,
    warehouseNetSyp: row.warehouseNetSyp,
  };
}

function toSettlementResponse({ period, totals, rows, asOf, collectionCommission }) {
  return {
    settlement: {
      period,
      totals,
      ...(collectionCommission ? { asOf, collectionCommission } : {}),
      orders: rows.map(serializeSettlementRow),
    },
  };
}

module.exports = { toSettlementResponse, serializeSettlementRow };
