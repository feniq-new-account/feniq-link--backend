function collectionOrderFields(order, { includeCommission = false } = {}) {
  if (order.commissionEngine !== 'collection_v2') return {};
  const position = order.$locals?.collectionPosition ?? null;
  return { commissionEngine: 'collection_v2', returnCreditReservedSyp: order.returnCreditReservedSyp ?? 0,
    netAfterReturnCreditSyp: Math.max(0, order.finalPrice - (order.returnCreditReservedSyp ?? 0)),
    ...(includeCommission ? { collectionAccounting: position ? {
      asOf: position.asOf, outstandingSyp: position.outstandingSyp, state: position.state,
      originalCommissionSyp: position.originalCommissionSyp, feniqSyp: position.feniqSyp, repSyp: position.repSyp,
      netScope: 'after_issued_returns_and_compensation_corrections_before_rep_share_and_delivery_fees',
      scope: 'current_invoice_all_dates', issuedReturnCreditSyp: order.$locals?.collectionReturns?.goodsSyp ?? 0,
      compensationClawbackSyp: order.$locals?.collectionReturns?.compensationClawbackSyp ?? 0,
    } : null } : {}),
  };
}
module.exports = { collectionOrderFields };
