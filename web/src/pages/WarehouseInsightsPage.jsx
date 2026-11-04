import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useWarehouseSubscription } from '../context/WarehouseSubscriptionContext';
import { api } from '../api/client';
import { WarehouseGroupSubNav } from '../components/WarehouseGroupSubNav';
import { WarehouseTrendChart } from '../components/WarehouseTrendChart';
import { formatSyp } from '../utils/currency';
import { asciiDigits } from '../utils/digits';
import { displayName } from '../utils/displayName';
import { downloadReportCsv } from '../utils/reportCsv';

export function WarehouseInsightsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasFeature, loading: subscriptionLoading } = useWarehouseSubscription();
  const [params, setParams] = useSearchParams();
  const canReport = hasFeature(user?.warehouseRole === 'owner' ? 'ownerInsights' : 'salesReports');
  const canAlerts = hasFeature('ownerAlerts');
  const tabs = [canReport && 'overview', hasFeature('overdueReceivables') && 'overdue', hasFeature('inactivePharmacies') && 'inactive', canAlerts && 'alerts'].filter(Boolean);
  const tab = tabs.includes(params.get('tab')) ? params.get('tab') : tabs[0];
  const [period, setPeriod] = useState('month');
  const [_data, setData] = useState(null);
  const [loadedFor, setLoadedFor] = useState('');
  const currentKey = `${tab}:${period}`;
  // A tab changes before its effect runs. Never render a report payload as
  // a follow-up payload, or show the previous period under a new heading.
  const data = loadedFor === currentKey ? _data : null;
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setData(null); setError(null); setActionError(null); setAlerts([]); setLoadingMore(false);
    if (subscriptionLoading || !tab) return;
    setLoading(true);
    const pending = tab === 'overview' ? api.warehouseInsights({ period, force: attempt > 0 }) : tab === 'alerts' ? api.warehouseInsightAlerts() : api.warehouseFollowUp({ kind: tab, force: attempt > 0 });
    pending.then((result) => { if (request === generation.current) { setData(result); setLoadedFor(currentKey); setSettings(result.settings); } })
      .catch((err) => { if (request === generation.current) setError(err.message); })
      .finally(() => { if (request === generation.current) setLoading(false); });
    if (tab === 'overview' && canAlerts) api.warehouseInsightAlerts().then((result) => {
      if (request === generation.current) setAlerts(result.alerts);
    }).catch(() => { /* The report remains usable if the separate alert feed is unavailable. */ });
    return () => { if (generation.current === request) generation.current = request + 1; };
  }, [tab, period, attempt, subscriptionLoading, canAlerts, currentKey]);
  const loadMore = async () => {
    if (loadingMore || !data?.pagination?.hasMore) return;
    const request = generation.current; setLoadingMore(true); setActionError(null);
    try {
      const next = await api.warehouseFollowUp({ kind: tab, after: data.pagination.nextCursor });
      if (request === generation.current) setData((old) => ({ ...old, rows: [...old.rows, ...next.rows.filter((row) => !old.rows.some((saved) => saved.pharmacy.id === row.pharmacy.id))], pagination: next.pagination }));
    } catch (err) { if (request === generation.current) setActionError(err.message); }
    finally { if (request === generation.current) setLoadingMore(false); }
  };
  const saveSettings = async (event) => {
    event.preventDefault(); setBusy(true); setActionError(null);
    try {
      const result = await api.saveWarehouseFollowUp({ overdueDays: Number(settings.overdueDays), inactiveDays: Number(settings.inactiveDays), revision: settings.revision });
      setSettings(result.settings); setAttempt((value) => value + 1);
    } catch (err) { setActionError(err.message); }
    finally { setBusy(false); }
  };
  const exportData = async () => {
    if (!data) return; setBusy(true); setActionError(null);
    try {
      let rows;
      let exportAsOf = data.asOfBusiness;
      if (tab === 'overview') {
        rows = [[t('insights.date'), t('insights.netSales'), t('insights.collections'), t('insights.returns')], ...data.daily.map((row) => [row.date, row.netSalesSyp, row.collectionsSyp, row.returnsSyp])];
      } else {
        const result = await api.warehouseFollowUpExport(tab);
        exportAsOf = result.asOfBusiness;
        rows = [[t('insights.pharmacy'), t('insights.phone'), t('insights.city'), t('insights.days'), t('insights.overdueAmount')],
          ...result.rows.map((row) => [displayName(row.pharmacy.nameEn, row.pharmacy.nameAr), row.pharmacy.phone, row.pharmacy.city,
            tab === 'overdue' ? row.oldestAgeDays : row.days, tab === 'overdue' ? row.overdueSyp : ''])];
      }
      downloadReportCsv(`feniq-${tab}-${exportAsOf.slice(0, 10)}.csv`, [[t('insights.asOf'), exportAsOf, 'Asia/Damascus'], ...rows]);
    } catch (err) { setActionError(err.message); }
    finally { setBusy(false); }
  };
  if (subscriptionLoading) return <p>{t('common.loading')}</p>;
  return <section className="warehouse-insights-page">
    <WarehouseGroupSubNav />
    <div className="wh-page-head"><div><h1>{t('insights.title')}</h1><p className="hint">{t('insights.scopeShort')}</p></div></div>
    {!tabs.length ? <p>{t('insights.inactiveFeature')} <Link to="/warehouse/debts">{t('insights.openStatements')}</Link></p> : <>
      <div className="insights-controls">
        {tabs.map((key) => <button key={key} type="button" className={key === tab ? 'btn-primary' : 'btn-secondary'} onClick={() => setParams({ tab: key })}>{t(`insights.tabs.${key}`)}</button>)}
        {tab === 'overview' && <label>{t('insights.period')}<select value={period} onChange={(event) => setPeriod(event.target.value)}>
          {['today', 'week', 'month'].map((value) => <option value={value} key={value}>{t(`whSummary.period${value[0].toUpperCase()}${value.slice(1)}`)}</option>)}
        </select></label>}
        <button type="button" className="btn-secondary" disabled={loading || busy} onClick={() => setAttempt((value) => value + 1)}>{t('insights.refresh')}</button>
        <button type="button" className="btn-secondary" disabled={!data || busy || tab === 'alerts'} onClick={exportData}>{t('insights.export')}</button>
      </div>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {actionError && <p className="error-text" role="alert">{actionError}</p>}
      {data && <>
        <p className="hint">{t('insights.asOf')} <span dir="ltr">{data.asOfBusiness}</span> · {t('insights.damascus')}</p>
        {tab === 'overview' ? <>
          <div className="insights-kpis">
            {[['netSales', data.totals.netSalesSyp], ['collections', data.totals.collectionsSyp], ['returns', data.totals.returnsSyp], ['debts', data.aging.totalDebtSyp]].map(([key, value]) =>
              <div className="wh-detail-card" key={key}><span>{t(`insights.${key}`)}</span><strong className="wh-num">{formatSyp(value)}</strong></div>)}
          </div>
          {alerts.length > 0 && <div className="insights-alerts">{alerts.map((alert) => <Link key={alert.code} to={alert.code === 'orders_pending' ? '/warehouse/orders' : alert.code === 'returns_pending' ? '/warehouse/returns' : `?tab=${alert.code}`}>
            {t(`insights.alerts.${alert.code}`, { count: alert.count })}{alert.amountSyp > 0 ? ` · ${formatSyp(alert.amountSyp)}` : ''}
          </Link>)}</div>}
          <WarehouseTrendChart daily={data.daily} />
          <section className="wh-detail-card"><h2>{t('insights.aging')}</h2><p className="hint">{t('insights.agingMethod')}</p>
            {data.aging.unknownAgeSyp > 0 && <p>{t('insights.unknownAge')} <bdi>{formatSyp(data.aging.unknownAgeSyp)}</bdi></p>}
            {data.aging.buckets.map((amount, i) => {
              const bounds = [0, data.settings.overdueDays, data.settings.overdueDays * 2, data.settings.overdueDays * 4];
              const label = i === 3 ? `${bounds[i]}+` : `${bounds[i]}–${bounds[i + 1] - 1}`;
              return <div className="insights-aging-row" key={i}><span dir="ltr">{label}</span><div className="insights-aging-track"><div style={{ width: `${amount / Math.max(1, ...data.aging.buckets) * 100}%` }} /></div><b className="wh-num">{formatSyp(amount)}</b></div>;
            })}
          </section>
          <details className="wh-detail-card"><summary>{t('insights.dailyTable')}</summary><div className="table-scroll"><table className="wh-table">
            <thead><tr><th>{t('insights.date')}</th><th>{t('insights.netSales')}</th><th>{t('insights.collections')}</th><th>{t('insights.returns')}</th></tr></thead>
            <tbody>{data.daily.map((row) => <tr key={row.date}><td dir="ltr">{row.date}</td><td className="wh-num">{formatSyp(row.netSalesSyp)}</td><td className="wh-num">{formatSyp(row.collectionsSyp)}</td><td className="wh-num">{formatSyp(row.returnsSyp)}</td></tr>)}</tbody>
          </table></div></details>
          <details className="wh-detail-card"><summary>{t('insights.about')}</summary><p>{t('insights.scope')}</p></details>
        </> : tab === 'alerts' ? <div className="insights-alerts">
          {data.alerts.length === 0 && <p>{t('insights.noAlerts')}</p>}
          {data.alerts.map((alert) => <Link key={alert.code}
            to={alert.code === 'orders_pending' ? '/warehouse/orders' : alert.code === 'returns_pending' ? '/warehouse/returns' : `?tab=${alert.code}`}>
            {t(`insights.alerts.${alert.code}`, { count: alert.count })}{alert.amountSyp > 0 ? ` · ${formatSyp(alert.amountSyp)}` : ''}
          </Link>)}
        </div> : <>
          <p>{t('insights.results', { count: data.total })}</p>
          {data.rows.length === 0 ? <p>{t('insights.empty')}</p> : <div className="wh-card table-scroll"><table className="wh-table">
            <thead><tr><th>{t('insights.pharmacy')}</th><th>{t('insights.days')}</th>{tab === 'overdue' && <th>{t('insights.overdueAmount')}</th>}<th>{t('insights.action')}</th></tr></thead>
            <tbody>{data.rows.map((row) => <tr key={row.pharmacy.id}><td>{displayName(row.pharmacy.nameEn, row.pharmacy.nameAr)}<div className="wh-table-sub">{row.pharmacy.city} · <span dir="ltr">{row.pharmacy.phone}</span></div></td>
              <td className="wh-num">{tab === 'overdue' ? row.oldestAgeDays : row.days}</td>{tab === 'overdue' && <td className="wh-num">{formatSyp(row.overdueSyp)}</td>}
              <td><Link to={`/warehouse/debts?pharmacy=${row.pharmacy.id}`}>{t('insights.openStatement')}</Link></td></tr>)}</tbody>
          </table></div>}
          {data.pagination.hasMore && <button className="btn-secondary" disabled={loadingMore} onClick={loadMore}>{t(loadingMore ? 'common.loading' : 'insights.loadMore')}</button>}
          {settings && <details className="wh-detail-card"><summary>{t('insights.settings')}</summary><form onSubmit={saveSettings} className="insights-settings">
            {['overdueDays', 'inactiveDays'].map((key) => <label key={key}>{t(`insights.${key}`)}<input dir="ltr" inputMode="numeric" required value={settings[key]} onChange={(event) => setSettings((old) => ({ ...old, [key]: asciiDigits(event.target.value) }))} /></label>)}
            <button className="btn-primary" disabled={busy}>{t('insights.saveSettings')}</button>
          </form></details>}
        </>}
      </>}
    </>}
  </section>;
}
