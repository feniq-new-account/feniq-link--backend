import { describe, expect, it } from 'vitest';
import { mergeAdvancedOrders, rememberAdvanced, syncAdvancedWithRows } from './warehouseOrdersList';

const order = (id, orderNumber, status = 'pending') => ({ id, orderNumber, status });

describe('mergeAdvancedOrders', () => {
  it('leaves the list alone when nothing was advanced', () => {
    const rows = [order('a', 1), order('b', 2)];
    expect(mergeAdvancedOrders(rows, new Map())).toBe(rows);
  });

  it('keeps an advanced order in place with its new status, though the tab no longer lists it', () => {
    const a = order('a', 1);
    let advanced = rememberAdvanced(new Map(), a, 'confirmed');
    // The "Pending" tab reloads without it.
    const merged = mergeAdvancedOrders([order('b', 2), order('c', 3)], advanced);
    expect(merged.map((o) => [o.id, o.status])).toEqual([
      ['a', 'confirmed'],
      ['b', 'pending'],
      ['c', 'pending'],
    ]);

    // And the next click moves it on again, still in place.
    advanced = rememberAdvanced(advanced, a, 'preparing');
    expect(mergeAdvancedOrders([order('b', 2)], advanced)[0]).toMatchObject({ id: 'a', status: 'preparing' });
  });

  it('a listed order takes the status it was advanced to', () => {
    const advanced = rememberAdvanced(new Map(), order('b', 2), 'out_for_delivery');
    const merged = mergeAdvancedOrders([order('a', 1), order('b', 2, 'preparing')], advanced);
    expect(merged[1].status).toBe('out_for_delivery');
  });
});

describe('syncAdvancedWithRows', () => {
  it('a status further along on the server wins, and so does a cancellation', () => {
    let advanced = rememberAdvanced(new Map(), order('a', 1), 'confirmed');
    advanced = rememberAdvanced(advanced, order('b', 2), 'confirmed');
    const synced = syncAdvancedWithRows(advanced, [order('a', 1, 'preparing'), order('b', 2, 'cancelled')]);
    expect(synced.get('a').status).toBe('preparing');
    expect(synced.get('b').status).toBe('cancelled');
  });

  it('an older status from a reload does not undo a click', () => {
    const advanced = rememberAdvanced(new Map(), order('a', 1), 'preparing');
    expect(syncAdvancedWithRows(advanced, [order('a', 1, 'confirmed')])).toBe(advanced);
  });
});

describe('nextStatusOf', () => {
  it('walks the stages one at a time and stops at delivered or cancelled', () => {
    const { nextStatusOf } = require('./warehouseOrdersList');
    expect(nextStatusOf('pending')).toBe('confirmed');
    expect(nextStatusOf('confirmed')).toBe('preparing');
    expect(nextStatusOf('preparing')).toBe('out_for_delivery');
    expect(nextStatusOf('out_for_delivery')).toBe('delivered');
    expect(nextStatusOf('delivered')).toBeNull();
    expect(nextStatusOf('cancelled')).toBeNull();
  });
});
