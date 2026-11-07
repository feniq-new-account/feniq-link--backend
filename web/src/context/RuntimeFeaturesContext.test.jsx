// @vitest-environment jsdom
import { act, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { RuntimeFeaturesContext, RuntimeFeaturesProvider } from './RuntimeFeaturesContext';
import { runtimeWarehouseNav } from '../utils/warehouseNav';
vi.mock('../api/client', () => ({ api: { runtimeFeatures: vi.fn() } }));
let host, root;
function Probe() {
  const { mutualRatings } = useContext(RuntimeFeaturesContext);
  const paths = runtimeWarehouseNav(mutualRatings).flatMap(item => item.children || [item]).map(item => item.path);
  return <span>{mutualRatings ? 'ON' : 'OFF'} {paths.join(' ')}</span>;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
it('follows server ON/OFF/ON without a reload and hides the reviews navigation when OFF', async () => {
  api.runtimeFeatures.mockResolvedValue({ features: { mutualRatings: true } });
  await act(async () => root.render(<RuntimeFeaturesProvider><Probe /></RuntimeFeaturesProvider>));
  expect(host.textContent).toContain('ON'); expect(host.textContent).toContain('/warehouse/reviews');
  api.runtimeFeatures.mockResolvedValue({ features: { mutualRatings: false } });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(host.textContent).toContain('OFF'); expect(host.textContent).not.toContain('/warehouse/reviews');
  api.runtimeFeatures.mockResolvedValue({ features: { mutualRatings: true } });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toContain('ON'); expect(host.textContent).toContain('/warehouse/reviews');
});
it('fails closed on an unreadable setting and ignores an older response', async () => {
  let resolveOld;
  api.runtimeFeatures.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockRejectedValueOnce(new Error('offline'));
  await act(async () => root.render(<RuntimeFeaturesProvider><Probe /></RuntimeFeaturesProvider>));
  expect(host.textContent).toContain('OFF');
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => resolveOld({ features: { mutualRatings: true } }));
  expect(host.textContent).toContain('OFF');
});
