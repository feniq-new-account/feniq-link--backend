import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { WarehouseTrendChart } from '../components/WarehouseTrendChart';
import { formatSyp } from '../utils/currency';
import { downloadReportCsv } from '../utils/reportCsv';

const TABS = ['overview', 'regions', 'demand', 'operations', 'subscriptions'];
export function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month'), [tab, setTab] = useState('overview'), [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null), [loadedPeriod, setLoadedPeriod] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current; let live = true; setLoading(true); setError('');
    api.platformAnalytics({ period, force: attempt > 0 }).then((response) => {
      if (live && generation.current === current) { setResult(response); setLoadedPeriod(period); }
    }).catch((err) => { if (live && generation.current === current) setError(err.message); })
      .finally(() => { if (live && generation.current === current) setLoading(false); });
    return () => { live = false; };
  }, [period, attempt]);
  const data = loadedPeriod === period && !error && !loading ? result : null;
  const count = (n) => Number(n).toLocaleString('en-US');
  const metric = (label, value) => <article className="wh-detail-card" key={label}><span>{label}</span><strong>{value}</strong></article>;
  const stateLabel = (key) => t(`warehouseAccess.states.${key}`, { defaultValue: key });
  function exportRows() {
    if (!data) return;
    let rows = [[t('analytics.scope')], [t('insights.asOf'), data.asOfBusiness, data.timezone], [data.period.fromDate, data.period.toDate]];
    if (tab === 'regions') rows.push([t('analytics.region'), t('analytics.requests'), t('analytics.cancelled'), t('insights.netSales'), t('insights.collections')], ...data.regions.map((r) => [regionName(r), r.orders, r.cancelled, r.netSalesSyp, r.collectionsSyp]));
    else if (tab === 'demand') rows.push([t('analytics.medicine'), t('analytics.orderFrequency'), t('analytics.linked')], ...data.demand.map((r) => [r.nameAr || r.nameEn, r.orders, r.linked ? t('analytics.linked') : t('analytics.unlinked')]));
    else if (tab === 'operations') rows.push(
      [t('analytics.retention'), data.previous.fromBusiness, data.previous.toBusiness],
      [t('analytics.activePharmacies'), data.retention.current], [t('analytics.previousPharmacies'), data.retention.previous],
      [t('analytics.retained'), data.retention.percent], [t('analytics.returned'), data.retention.returned],
      [t('analytics.acceptance'), data.timing.acceptanceHours, data.timing.acceptedSamples],
      [t('analytics.delivery'), data.timing.deliveryHours, data.timing.deliveredSamples],
      [t('analytics.reasons')], ...data.cancellationReasons.map((r) => [r.reason || t('analytics.noReason'), r.count]));
    else if (tab === 'subscriptions') rows.push([t('analytics.subscriptions')],
      ...Object.entries(data.subscriptions.states).map(([key, n]) => [stateLabel(key), n]),
      [t('analytics.availability')], ...Object.entries(data.subscriptions.featureAvailability).map(([key, n]) => [t(`warehouseAccess.features.${key}`), n]),
      [t('analytics.usage')], ...['loyaltyOrders', 'scheduledOrders', 'paymentPosts', 'paymentReversals'].map((key) => [t(`analytics.${key}`), data.featureUsage[key]]),
      [t('analytics.verifiedVisits'), data.featureUsage.visits.verified || 0]);
    else rows.push([t('insights.date'), t('insights.netSales'), t('insights.collections'), t('insights.returns')], ...data.daily.map((r) => [r.date, r.netSalesSyp, r.collectionsSyp, r.returnsSyp]));
    downloadReportCsv(`feniq-platform-${tab}-${period}.csv`, rows);
  }
  function regionName(row) { return `${row.city || t('analytics.unknownRegion')} · ${t(`analytics.area.${row.areaType || 'unknown'}`, { defaultValue: row.areaType || t('analytics.unknownRegion') })}`; }
  return <div className="analytics-page">
    <div className="wh-page-head"><h1>{t('analytics.title')}</h1></div>
    <p className="hint">{t('analytics.scope')}</p>
    <div className="insights-controls"><label>{t('insights.period')}<select value={period} onChange={(e) => setPeriod(e.target.value)}>{['today', 'week', 'month'].map((p) => <option key={p} value={p}>{t(`whSummary.period${p[0].toUpperCase()}${p.slice(1)}`)}</option>)}</select></label><button className="btn-secondary" disabled={loading} onClick={() => setAttempt((n) => n + 1)}>{t('insights.refresh')}</button><button className="btn-secondary" disabled={!data} onClick={exportRows}>{t('insights.export')}</button></div>
    <div className="insights-tabs" role="tablist" aria-label={t('analytics.title')}>{TABS.map((name) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{t(`analytics.tabs.${name}`)}</button>)}</div>
    {loading && <p role="status">{t('common.loading')}</p>}
    {error && <div role="alert"><p>{error}</p><button className="btn-secondary" onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</button></div>}
    {data && <>
      <p className="hint">{t('insights.asOf')}: <bdi>{data.asOfBusiness}</bdi> · {t('insights.damascus')}</p>
      {tab === 'overview' && <>
        <div className="insights-kpis">{metric(t('analytics.requests'), count(data.orders.requestedOrders))}{metric(t('analytics.cancelled'), count(data.orders.cancelledOrders))}{metric(t('insights.netSales'), formatSyp(data.totals.netSalesSyp))}{metric(t('insights.collections'), formatSyp(data.totals.collectionsSyp))}</div>
        <p className="hint">{t('analytics.measurement')}</p><WarehouseTrendChart daily={data.daily} />
        <details className="wh-detail-card"><summary>{t('analytics.statuses')}</summary>{Object.entries(data.orders.statuses).map(([key, value]) => <p key={key}>{t(`orders.status${key.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`, { defaultValue: key })}: <bdi>{count(value)}</bdi></p>)}</details>
      </>}
      {tab === 'regions' && <><p className="hint">{t('analytics.regionNote')}</p>{data.regions.length === 0 && <p>{t('analytics.empty')}</p>}{data.regions.map((r) => <article className="wh-detail-card analytics-row" key={`${r.city}-${r.areaType}`}><h2>{regionName(r)}</h2><dl><div><dt>{t('analytics.requests')}</dt><dd>{count(r.orders)}</dd></div><div><dt>{t('analytics.cancelled')}</dt><dd>{count(r.cancelled)}</dd></div><div><dt>{t('insights.netSales')}</dt><dd>{formatSyp(r.netSalesSyp)}</dd></div><div><dt>{t('insights.collections')}</dt><dd>{formatSyp(r.collectionsSyp)}</dd></div></dl></article>)}</>}
      {tab === 'demand' && <><p className="hint">{t('analytics.demandNote')}</p>{data.demand.length === 0 && <p>{t('analytics.empty')}</p>}{data.demand.map((row, index) => <article className="wh-detail-card analytics-row" key={row.id}><h2><bdi>{index + 1}.</bdi> {row.nameAr || row.nameEn}</h2><p>{t('analytics.orderFrequency')}: <bdi>{count(row.orders)}</bdi></p>{!row.linked && <p className="hint">{t('analytics.unlinked')}</p>}</article>)}</>}
      {tab === 'operations' && <>
        <section className="wh-detail-card"><h2>{t('analytics.retention')}</h2><p className="hint">{t('analytics.retentionNote')}</p><p><bdi>{data.previous.fromBusiness} — {data.previous.toBusiness}</bdi></p><div className="insights-kpis">{metric(t('analytics.activePharmacies'), count(data.retention.current))}{metric(t('analytics.previousPharmacies'), count(data.retention.previous))}{metric(t('analytics.retained'), data.retention.percent === null ? '—' : `${count(data.retention.percent)}%`)}{metric(t('analytics.returned'), count(data.retention.returned))}</div></section>
        <section className="wh-detail-card"><h2>{t('analytics.timing')}</h2><p>{t('analytics.acceptance')}: <bdi>{data.timing.acceptanceHours ?? '—'}</bdi> {t('analytics.hours')} · <bdi>{count(data.timing.acceptedSamples)}</bdi> {t('analytics.samples')}</p><p>{t('analytics.delivery')}: <bdi>{data.timing.deliveryHours ?? '—'}</bdi> {t('analytics.hours')} · <bdi>{count(data.timing.deliveredSamples)}</bdi> {t('analytics.samples')}</p><p className="hint">{t('analytics.timingNote')}</p></section>
        <section className="wh-detail-card"><h2>{t('analytics.reasons')}</h2>{data.cancellationReasons.length === 0 && <p>{t('analytics.empty')}</p>}{data.cancellationReasons.map((row) => <p key={row.reason}>{row.reason || t('analytics.noReason')}: <bdi>{count(row.count)}</bdi></p>)}</section>
      </>}
      {tab === 'subscriptions' && <>
        <section className="wh-detail-card"><h2>{t('analytics.subscriptions')}</h2><p>{t('analytics.warehouses')}: <bdi>{count(data.subscriptions.warehouses)}</bdi></p>{Object.entries(data.subscriptions.states).map(([state, n]) => <p key={state}>{stateLabel(state)}: <bdi>{count(n)}</bdi></p>)}</section>
        <section className="wh-detail-card"><h2>{t('analytics.availability')}</h2><p className="hint">{t('analytics.availabilityNote')}</p>{Object.entries(data.subscriptions.featureAvailability).map(([feature, n]) => <p key={feature}>{t(`warehouseAccess.features.${feature}`, { defaultValue: feature })}: <bdi>{count(n)}</bdi></p>)}</section>
        <section className="wh-detail-card"><h2>{t('analytics.usage')}</h2><p className="hint">{t('analytics.usageNote')}</p>{['loyaltyOrders', 'scheduledOrders', 'paymentPosts', 'paymentReversals'].map((key) => <p key={key}>{t(`analytics.${key}`)}: <bdi>{count(data.featureUsage[key])}</bdi></p>)}<p>{t('analytics.verifiedVisits')}: <bdi>{count(data.featureUsage.visits.verified || 0)}</bdi></p></section>
      </>}
    </>}
  </div>;
}
