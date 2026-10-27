import { describe, it, expect, vi } from 'vitest';
import { createDeliveryCollectionStore } from './deliveryCollection';
function storage() { const rows = new Map(); return { getItem: (k) => rows.get(k) ?? null, setItem: (k,v) => rows.set(k,v) }; }
const order = { id: 'order-1', orderNumber: 1, pharmacy: { id: 'pharmacy-1' } };
describe('recovering an uncertain delivery collection', () => {
  it('reuses the original payment key after commit succeeded but the response was lost, including a restart', async () => {
    const disk = storage(); let store = createDeliveryCollectionStore('warehouse-1', disk);
    const payments = new Set(); const keys = [];
    const api = { advanceOrderStatus: vi.fn(async () => ({})), createPayment: vi.fn(async (p) => {
      keys.push(p.idempotencyKey); payments.add(p.idempotencyKey);
      if (keys.length === 1) throw new Error('response lost');
    }) };
    const item = store.prepare(order, 3000, 'cash');
    await expect(store.run(api,item)).rejects.toThrow('response lost');
    expect(store.list()[0].phase).toBe('payment');
    store = createDeliveryCollectionStore('warehouse-1', disk);
    await store.run(api,store.list()[0]);
    expect(payments.size).toBe(1); expect(new Set(keys).size).toBe(1);
    expect(api.advanceOrderStatus).toHaveBeenCalledTimes(1); expect(store.list()).toEqual([]);
    expect(createDeliveryCollectionStore('another-account', disk).list()).toEqual([]);
  });
  it('retries an uncertain delivery with the same expected and target state', async () => {
    const store = createDeliveryCollectionStore('warehouse-1', storage());
    const api = { advanceOrderStatus: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({}), createPayment: vi.fn().mockResolvedValue({}) };
    const item = store.prepare(order, 1000, 'part');
    await expect(store.run(api,item)).rejects.toThrow(); await store.run(api,item);
    expect(api.advanceOrderStatus.mock.calls[0]).toEqual(api.advanceOrderStatus.mock.calls[1]);
    expect(api.createPayment).toHaveBeenCalledTimes(1);
  });
  it('coalesces double clicks and retains one pending operation per order', async () => {
    const store = createDeliveryCollectionStore('w', storage());
    const api = { advanceOrderStatus: vi.fn(async () => ({})), createPayment: vi.fn(async () => ({})) };
    const item = store.prepare(order, 1000, 'cash');
    expect(store.prepare(order, 2000, 'another')).toBe(item);
    await Promise.all([store.run(api,item),store.run(api,item)]);
    expect(api.createPayment).toHaveBeenCalledTimes(1);
  });
});
