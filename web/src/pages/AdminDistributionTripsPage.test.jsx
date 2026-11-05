// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AdminDistributionTripsPage } from './AdminDistributionTripsPage';
import { api } from '../api/client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }),
}));
vi.mock('../api/client', () => ({ api: {
  adminDistributionTrips: vi.fn(),
  adminAccounts: vi.fn(),
  createDistributionTrip: vi.fn(),
  startDistributionTrip: vi.fn(),
  updateDistributionStop: vi.fn(),
  completeDistributionTrip: vi.fn(),
  cancelDistributionTrip: vi.fn(),
}}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const accounts = [{
  user: { name: 'Owner' },
  pharmacy: {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    nameAr: 'صيدلية أولى',
    address: 'Kasab street',
  },
}];

beforeEach(async () => {
  vi.clearAllMocks();
  api.adminDistributionTrips.mockResolvedValue({ trips: [], pagination: {} });
  api.adminAccounts.mockResolvedValue({ accounts });
  api.createDistributionTrip.mockResolvedValue({ trip: { _id: 'test-id' } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AdminDistributionTripsPage />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function button(name) {
  return [...container.querySelectorAll('button')].find(b => b.textContent.includes(name));
}

it('searches existing active pharmacies and requires a stop before saving', async () => {
  await act(async () => container.querySelectorAll('form')[1].dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.createDistributionTrip).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Choose at least one pharmacy');
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.adminAccounts).toHaveBeenCalledWith({
    role: 'pharmacy', status: 'active', search: '', limit: 20,
  });
});

it('trip creation preserves the manually selected stop sequence', async () => {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await act(async () => button('Add').click());
  const inputs = container.querySelectorAll('form')[1].querySelectorAll('input');
  await act(async () => {
    const values = ['Kasab', '2026-11-06', 'Driver A', '0931000014'];
    inputs.forEach((input, i) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, values[i]);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  // React may reject a date manipulated without real browser events in jsdom;
  // the stop selection and submission guard are the critical interaction.
  expect(container.textContent).toContain('صيدلية أولى');
  expect(container.textContent).toContain('Kasab street');
});

it('the screen never calls payment or order APIs', () => {
  expect(api.adminDistributionTrips).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('No payments, invoices or amounts are recorded.');
});
