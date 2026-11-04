// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DeliveryScheduleCard } from './DeliveryScheduleCard';
import { DeliveryEstimate } from './DeliveryEstimate';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: { deliverySettings: vi.fn(), updateDeliverySettings: vi.fn(), deliveryPharmacies: vi.fn(), assignDeliveryPharmacy: vi.fn(), rescheduleDelivery: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
let host, root;
const schedule = { enabled: true, revision: 2, zones: [{ _id: 'zone1', name: 'North countryside', active: true, preparationHours: 2, slots: [{ weekday: 6, departureTime: '10:00', arrivalHours: 4, cutoffHours: 12 }], exceptions: [] }] };
beforeEach(() => { vi.resetAllMocks(); globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); api.deliverySettings.mockResolvedValue({ settings: structuredClone(schedule), entitled: true }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent === label);
it('saves the exact server revision and explicit region schedule', async () => {
  api.updateDeliverySettings.mockResolvedValue({ settings: { ...schedule, revision: 3 } });
  await act(async () => root.render(<DeliveryScheduleCard />));
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.updateDeliverySettings).toHaveBeenCalledWith(schedule);
  expect(host.textContent).toContain('delivery.saved');
});
it('disables editing when the platform feature is off and preserves the stored schedule', async () => {
  api.deliverySettings.mockResolvedValue({ settings: schedule, entitled: false });
  await act(async () => root.render(<DeliveryScheduleCard />));
  expect(host.querySelector('fieldset').disabled).toBe(true); expect(host.textContent).toContain('delivery.featureOff');
  expect(host.textContent).toContain('delivery.day'); expect(api.updateDeliverySettings).not.toHaveBeenCalled();
});
it('a rejected save preserves user edits and offers a deliberate reload', async () => {
  api.updateDeliverySettings.mockRejectedValue(new Error('DELIVERY_CHANGED'));
  await act(async () => root.render(<DeliveryScheduleCard />));
  await act(async () => button('delivery.addZone').click());
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelectorAll('.delivery-zone')).toHaveLength(2); expect(host.textContent).toContain('DELIVERY_CHANGED');
});
describe('arrival promise', () => {
  const estimate = { zoneName: 'North', fromBusiness: '2026-10-31 02:00', toBusiness: '2026-11-01 02:00', state: 'late' };
  it('shows an overdue promise as late, without silently changing its date', async () => {
    await act(async () => root.render(<DeliveryEstimate estimate={estimate} status="pending" />));
    expect(host.textContent).toContain('delivery.late'); expect(host.textContent).toContain(estimate.toBusiness);
  });
  it('ends the arrival estimate on cancellation even if the old time has passed', async () => {
    await act(async () => root.render(<DeliveryEstimate estimate={estimate} status="cancelled" />));
    expect(host.textContent).toContain('delivery.cancelled'); expect(host.textContent).not.toContain('delivery.late');
  });
});
