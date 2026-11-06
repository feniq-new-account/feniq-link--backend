import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './client';
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, rows: [] }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());
it('passes the overdue preview limit without changing existing callers', async () => {
  await api.warehouseFollowUp({ kind: 'overdue', force: true, limit: 5 });
  let url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get('limit')).toBe('5'); expect(url.searchParams.get('force')).toBe('1');
  await api.warehouseFollowUp({ kind: 'overdue' });
  url = new URL(fetch.mock.calls[1][0]); expect(url.searchParams.has('limit')).toBe(false);
});
it('serializes dashboard period and kind filters through the read endpoint', async () => {
  await api.accountantDashboard({ period: 'custom', from: '2026-11-01', to: '2026-11-06', kind: 'payment_reversal' });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/api/warehouse/balances/dashboard');
  expect(url.searchParams.get('kind')).toBe('payment_reversal'); expect(url.searchParams.get('from')).toBe('2026-11-01');
});
