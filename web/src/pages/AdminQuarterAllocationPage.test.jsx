// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AdminQuarterAllocationPage } from './AdminQuarterAllocationPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
vi.mock('../api/client', () => ({
  api: {
    getQuarterAllocationDraft: vi.fn(),
    previewQuarterAllocationDraft: vi.fn(),
    saveQuarterAllocationDraft: vi.fn(),
  },
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const defaultPlan = {
  city: { feniqToPharmacyBps: 0, repToPharmacyBps: 0 },
  outside: { feniqToPharmacyBps: 0 },
};
beforeEach(() => {
  vi.clearAllMocks();
  api.getQuarterAllocationDraft.mockResolvedValue({
    allocation: { revision: 0, plan: defaultPlan, draftOnly: true, appliesToLiveAccounting: false },
  });
  api.previewQuarterAllocationDraft.mockResolvedValue({
    previewOnly: true, persisted: false,
    city: {
      baseQuarters: { feniq: 2, rep: 2 },
      earned: { feniqSyp: 1000, repSyp: 500, pharmacySyp: 500, pharmacyFromFeniqSyp: 0, pharmacyFromRepSyp: 500 },
    },
    outside: {
      baseQuarters: { feniq: 4, rep: 0 },
      earned: { feniqSyp: 1500, repSyp: 0, pharmacySyp: 500, pharmacyFromFeniqSyp: 500, pharmacyFromRepSyp: 0 },
    },
  });
  api.saveQuarterAllocationDraft.mockImplementation(async body => ({
    allocation: { revision: body.revision + 1, plan: body.plan, draftOnly: true, appliesToLiveAccounting: false },
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const inputChange = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const render = async () => {
  await act(async () => root.render(<AdminQuarterAllocationPage />));
};
it('shows explicit staged-only warning with both geographic allocation editors', async () => {
  await render();
  expect(api.getQuarterAllocationDraft).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('quarterPolicy.draftWarning');
  expect(host.querySelectorAll('.quarter-layout > .quarter-panel')).toHaveLength(2);
  expect([...host.querySelectorAll('.quarter-percentage input')].map(x => x.value)).toEqual(['0','0','0']);
  expect(host.querySelector('[type=submit]')).not.toBeNull();
});
it('separates percentages of each donor and sends a source-only simulation', async () => {
  await render();
  const amounts = host.querySelectorAll('.quarter-percentage input');
  await act(async () => {
    inputChange(amounts[1], '50');
    inputChange(amounts[2], '25');
  });
  await act(async () => host.querySelector('.quarter-panel button[type=button]').click());
  expect(api.previewQuarterAllocationDraft).toHaveBeenCalledWith(expect.objectContaining({
    plan: {
      city: { feniqToPharmacyBps: 0, repToPharmacyBps: 5000 },
      outside: { feniqToPharmacyBps: 2500 },
    },
    invoiceSyp: 100000, originalCommissionSyp: 2000, eligibleCollectedSyp: 100000,
  }));
  expect(host.querySelectorAll('.quarter-result-card')).toHaveLength(2);
});
it('accepts two decimal percent text and persists the draft only with a reason', async () => {
  await render();
  const amount = host.querySelectorAll('.quarter-percentage input')[1];
  await act(async () => inputChange(amount, '33.33'));
  await act(async () => inputChange(host.querySelector('input[maxlength="500"]'), 'Quarter reserve adjustment'));
  await act(async () => host.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  ));
  expect(api.saveQuarterAllocationDraft).toHaveBeenCalledWith({
    revision: 0,
    plan: {
      city: { feniqToPharmacyBps: 0, repToPharmacyBps: 3333 },
      outside: { feniqToPharmacyBps: 0 },
    },
    reason: 'Quarter reserve adjustment',
  });
  expect(host.textContent).toContain('quarterPolicy.savedDraft');
});
it('rejects impossible donor percentages before any admin write', async () => {
  await render();
  const amount = host.querySelectorAll('.quarter-percentage input')[0];
  await act(async () => inputChange(amount, '100.01'));
  await act(async () => inputChange(host.querySelector('input[maxlength="500"]'), 'Invalid approval'));
  await act(async () => host.querySelector('form').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true })
  ));
  expect(api.saveQuarterAllocationDraft).not.toHaveBeenCalled();
  expect(host.querySelector('[role=alert]').textContent).toContain('quarterPolicy.invalidPercent');
});
