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

// The server's status for an order may move on without this tab (another
// operator, the pharmacy cancelling): a reload that carries a status further
// along than the one remembered wins.
const STAGE = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

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
    const listed = STAGE.indexOf(row.status);
    const remembered = STAGE.indexOf(entry.status);
    if (row.status === 'cancelled' || listed > remembered) {
      next.set(row.id, { order: row, status: row.status });
      changed = true;
    }
  }
  return changed ? next : advanced;
}
