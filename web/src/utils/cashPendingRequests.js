// Exact requests survive lost responses and navigation. Never reuse a pending
// request across authenticated accounts, warehouses, or operation types.
export function cashPendingRequests(accountId, warehouseId) {
  const prefix = `feniq.cash-pending:${encodeURIComponent(accountId)}:${encodeURIComponent(warehouseId)}:`;
  return {
    read() {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const value = JSON.parse(localStorage.getItem(key));
        if (value?.operation && value?.body?.idempotencyKey) result[key.slice(prefix.length)] = value;
      }
      return result;
    },
    save(value) { localStorage.setItem(prefix + value.operation, JSON.stringify(value)); },
    clear(operation) { localStorage.removeItem(prefix + operation); },
  };
}
