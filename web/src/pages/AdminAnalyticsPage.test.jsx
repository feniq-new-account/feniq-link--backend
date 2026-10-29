// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { AdminAnalyticsPage } from './AdminAnalyticsPage';
import { api } from '../api/client';
import { downloadReportCsv } from '../utils/reportCsv';
vi.mock('../api/client', () => ({ api: { platformAnalytics: vi.fn() } }));
vi.mock('../utils/reportCsv', () => ({ downloadReportCsv: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
export const fixture = { asOfBusiness:'2026-10-29 14:30', timezone:'Asia/Damascus', period:{fromDate:'2026-10-01',toDate:'2026-10-29'},
  previous:{fromBusiness:'2026-09-02 09:30',toBusiness:'2026-09-30 23:59'},
  orders:{requestedOrders:25,cancelledOrders:2,statuses:{pending:3,delivered:20,cancelled:2}},
  totals:{netSalesSyp:128745600,collectionsSyp:98245600,returnsSyp:1245600},
  daily:[{date:'2026-10-29',netSalesSyp:128745600,collectionsSyp:98245600,returnsSyp:1245600}],
  regions:[{city:'اللاذقية',areaType:'rural',orders:25,cancelled:2,netSalesSyp:128745600,collectionsSyp:98245600}],
  demand:[{id:'p1',nameAr:'دواء 500 mg',linked:true,orders:15}], timing:{acceptanceHours:2,acceptedSamples:20,deliveryHours:29,deliveredSamples:18},
  retention:{current:21,previous:20,retained:15,percent:75,returned:3}, cancellationReasons:[{reason:'تأخر الطلب',count:2}],
  subscriptions:{warehouses:5,states:{trial:3,active:2},featureAvailability:{loyalty:5,ownerInsights:5}},
  featureUsage:{loyaltyOrders:19,scheduledOrders:20,paymentPosts:35,paymentReversals:1,visits:{verified:25}} };
let host, root;
beforeEach(() => { vi.resetAllMocks(); api.platformAnalytics.mockResolvedValue(fixture); host = document.createElement('div');document.body.append(host);root=createRoot(host); });
afterEach(async () => { await act(async () => root.unmount());host.remove(); });
const button = (text) => [...host.querySelectorAll('button')].find((b)=>b.textContent===text);
it('shows posted financial KPIs and creation-date order counts with the source scope', async()=>{
  await act(async()=>root.render(<AdminAnalyticsPage/>));
  expect(host.textContent).toContain('128,745,600');expect(host.textContent).toContain('analytics.scope');expect(host.querySelector('input[type=range]')).not.toBeNull();
});
it('shows each report tab and exports its own values, rather than an unrelated daily series',async()=>{
  await act(async()=>root.render(<AdminAnalyticsPage/>));
  for (const tab of ['regions','demand','operations','subscriptions']) {
    await act(async()=>button(`analytics.tabs.${tab}`).click());
    await act(async()=>button('insights.export').click());
    const rows = downloadReportCsv.mock.calls.at(-1)[1];
    expect(rows[1]).toEqual(['insights.asOf',fixture.asOfBusiness,fixture.timezone]);
    if(tab==='subscriptions') expect(rows.flat()).toContain(35);
    if(tab==='operations') expect(rows.flat()).toContain(75);
    if(tab==='demand') expect(rows.flat()).toContain('دواء 500 mg');
  }
});
it('a previous failed month response cannot overwrite the selected day',async()=>{
  let reject;api.platformAnalytics.mockImplementation(({period})=>period==='month'?new Promise((_,fail)=>{reject=fail}):Promise.resolve(fixture));
  await act(async()=>root.render(<AdminAnalyticsPage/>));
  await act(async()=>{const select=host.querySelector('select');select.value='today';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await act(async()=>reject(new Error('old month')));
  expect(host.textContent).toContain('128,745,600');expect(host.textContent).not.toContain('old month');
});
