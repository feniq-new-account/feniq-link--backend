function publicEstimate(estimate, status, now = new Date()) {
  if (!estimate) return null;
  // The pharmacist needs the promise and its changes, not the warehouse's
  // full recurring schedule or hidden internal fields.
  const { source, history, ...publicFields } = estimate;
  return { ...publicFields, observedAt: now, state: ['cancelled', 'delivered'].includes(status) ? status : estimate.unavailable ? 'unavailable' : now > new Date(estimate.to) ? 'late' : 'expected', ...(history?.length ? { history: history.map((row) => publicEstimate(row, status, now)) } : {}) };
}
module.exports = { publicEstimate };
