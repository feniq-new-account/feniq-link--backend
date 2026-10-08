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
    let advanced = rememberAdvanced(new Map(), a, 'out_for_delivery');
    // The "Awaiting approval" tab reloads without it.
    const merged = mergeAdvancedOrders([order('b', 2), order('c', 3)], advanced);
    expect(merged.map((o) => [o.id, o.status])).toEqual([
      ['a', 'out_for_delivery'],
      ['b', 'pending'],
      ['c', 'pending'],
    ]);

    // And the next click moves it on again, still in place.
    advanced = rememberAdvanced(advanced, a, 'delivered');
    expect(mergeAdvancedOrders([order('b', 2)], advanced)[0]).toMatchObject({ id: 'a', status: 'delivered' });
  });

  it('a listed order takes the status it was advanced to', () => {
    const advanced = rememberAdvanced(new Map(), order('b', 2), 'out_for_delivery');
    const merged = mergeAdvancedOrders([order('a', 1), order('b', 2, 'preparing')], advanced);
    expect(merged[1].status).toBe('out_for_delivery');
  });
});

describe('syncAdvancedWithRows', () => {
  it('a status further along on the server wins, and so does a cancellation', () => {
    let advanced = rememberAdvanced(new Map(), order('a', 1), 'out_for_delivery');
    advanced = rememberAdvanced(advanced, order('b', 2), 'out_for_delivery');
    const synced = syncAdvancedWithRows(advanced, [order('a', 1, 'delivered'), order('b', 2, 'cancelled')]);
    expect(synced.get('a').status).toBe('delivered');
    expect(synced.get('b').status).toBe('cancelled');
  });

  it('an older status from a reload does not undo a click', () => {
    const advanced = rememberAdvanced(new Map(), order('a', 1), 'out_for_delivery');
    expect(syncAdvancedWithRows(advanced, [order('a', 1, 'pending')])).toBe(advanced);
  });
});

describe('nextStatusOf', () => {
  it('accept, then on the way, then delivered', () => {
    const { nextStatusOf } = require('./warehouseOrdersList');
    expect(nextStatusOf('pending')).toBe('confirmed');
    expect(nextStatusOf('confirmed')).toBe('out_for_delivery');
    expect(nextStatusOf('preparing')).toBe('out_for_delivery');
    expect(nextStatusOf('out_for_delivery')).toBe('delivered');
    expect(nextStatusOf('delivered')).toBeNull();
    expect(nextStatusOf('cancelled')).toBeNull();
  });
});

describe('isEditable', () => {
  it('only before the order is sent out', () => {
    const { isEditable } = require('./warehouseOrdersList');
    expect(['pending', 'confirmed', 'preparing'].every(isEditable)).toBe(true);
    expect(['out_for_delivery', 'delivered', 'cancelled'].some(isEditable)).toBe(false);
  });
});
