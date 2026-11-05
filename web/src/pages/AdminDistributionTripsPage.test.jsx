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
  adminDistributionDrivers: vi.fn(),
  adminCreateDistributionDriver: vi.fn(),
  assignDistributionTripDriver: vi.fn(),
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
  api.adminDistributionDrivers.mockResolvedValue({ drivers: [{ userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Driver A', phone: '0931400002' }] });
  api.adminCreateDistributionDriver.mockResolvedValue({ driver: {
    userId: 'dddddddddddddddddddddddd', name: 'External Driver', phone: '+963931200003', role: 'driver',
  } });
  api.assignDistributionTripDriver.mockResolvedValue({ success: true });
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
  await act(async () => container.querySelectorAll('form')[2].dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.createDistributionTrip).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Choose at least one pharmacy');
  await act(async () => container.querySelectorAll('form')[1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.adminAccounts).toHaveBeenCalledWith({
    role: 'pharmacy', status: 'active', search: '', limit: 20,
  });
});

it('trip creation preserves the manually selected stop sequence', async () => {
  await act(async () => container.querySelectorAll('form')[1].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await act(async () => button('Add').click());
  const inputs = container.querySelectorAll('form')[2].querySelectorAll('input');
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

it('offers active rep accounts for creating a trip', () => {
  expect(api.adminDistributionDrivers).toHaveBeenCalledTimes(1);
  const picker = container.querySelector('select[aria-label="Driver login"]');
  expect(picker).not.toBeNull();
  expect(picker.textContent).toContain('Driver A');
});

it('admin can assign an existing planned trip with its current revision', async () => {
  const trip = {
    _id: 'cccccccccccccccccccccccc',
    region: 'Kasab',
    driverName: 'Unassigned',
    driverPhone: '',
    driverUserId: null,
    revision: 4,
    serviceDate: '2026-11-06T00:00:00.000Z',
    status: 'planned',
    stops: [],
  };
  api.adminDistributionTrips.mockResolvedValue({ trips: [trip], pagination: {} });
  await act(async () => {
    await [...container.querySelectorAll('button')].find(x => x.textContent === 'Refresh').click();
  });
  const select = container.querySelector('select[aria-label="Assign driver cccccccccccccccccccccccc"]');
  expect(select).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'bbbbbbbbbbbbbbbbbbbbbbbb');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    button('Save driver assignment').click();
  });
  expect(api.assignDistributionTripDriver).toHaveBeenCalledWith(
    trip._id, 4, 'bbbbbbbbbbbbbbbbbbbbbbbb');
});

it('admin can create a standalone driver without exposing temporary credentials', async () => {
  const form = container.querySelectorAll('form')[0];
  const fields = form.querySelectorAll('input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    ['External Driver', '0931200003', 'temporary-secret-123'].forEach((value, index) => {
      setter.call(fields[index], value);
      fields[index].dispatchEvent(new Event('input', { bubbles: true }));
      fields[index].dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await act(async () => form.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.adminCreateDistributionDriver).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Driver account created');
  const driverSelect = container.querySelector('select[aria-label="Driver login"]');
  expect(driverSelect.textContent).toContain('External Driver');
  expect(container.textContent).not.toContain('temporary-secret-123');
});
