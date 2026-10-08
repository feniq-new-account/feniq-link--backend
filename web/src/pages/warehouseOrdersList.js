// The warehouse moves an order through its stages from the orders list, one
// click per stage. An order it just advanced must stay where it is, showing
// its new status and the next stage's button - even though the new status no
// longer matches the tab (advancing out of "Pending" would otherwise make the
// order vanish, and the operator had to go and find it again for every step).
//
// `advanced` maps order id -> { order, status }: the order as it was listed,
// and the status the server answered with. Every reload of the list is merged
// with it: a listed order takes its newer status, and an advanced order the
// reload no longer contains is put back. The result is in orderNumber order,
// oldest first - the same order the server pages in.
export function mergeAdvancedOrders(rows, advanced) {
  if (!advanced || advanced.size === 0) return rows;
  const seen = new Set();
  const merged = rows.map((row) => {
    seen.add(row.id);
    const entry = advanced.get(row.id);
    return entry ? { ...row, status: entry.status } : row;
  });
  for (const [id, entry] of advanced) {
    if (!seen.has(id)) merged.push({ ...entry.order, status: entry.status });
  }
  return merged.sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0));
}

// The warehouse's three stages: accept -> on the way -> delivered (the
// pharmacy's "received" tap or 24 hours close it too). 'preparing' is no
// longer reached; an older order left in it counts as accepted.
export const AWAITING_APPROVAL = ['pending', 'confirmed', 'preparing'];
const RANK = { pending: 0, confirmed: 1, preparing: 1, out_for_delivery: 2, delivered: 3 };
const NEXT = { pending: 'confirmed', confirmed: 'out_for_delivery', preparing: 'out_for_delivery', out_for_delivery: 'delivered' };

// The stage a click moves an order to; null past the last one (or cancelled).
export function nextStatusOf(status) {
  return NEXT[status] ?? null;
}

// Whether the warehouse may still change the order's items (before it is sent).
export function isEditable(status) {
  return AWAITING_APPROVAL.includes(status);
}

export function rememberAdvanced(advanced, order, status) {
  const next = new Map(advanced);
  next.set(order.id, { order, status });
  return next;
}

export function syncAdvancedWithRows(advanced, rows) {
  if (advanced.size === 0) return advanced;
  let changed = false;
  const next = new Map(advanced);
  for (const row of rows) {
    const entry = next.get(row.id);
    if (!entry) continue;
    const listed = RANK[row.status] ?? -1;
    const remembered = RANK[entry.status] ?? -1;
    if (row.status === 'cancelled' || listed > remembered) {
      next.set(row.id, { order: row, status: row.status });
      changed = true;
    }
  }
  return changed ? next : advanced;
}
