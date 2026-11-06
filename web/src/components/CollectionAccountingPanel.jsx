import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { formatBusinessDateTime, businessDateInputValue, startOfBusinessMonthInputValue } from '../utils/businessDate';

// Read only: all monetary figures and pagination come from one server snapshot.
export function CollectionAccountingPanel({ warehouseId }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ period: 'month', search: '', state: '', from: startOfBusinessMonthInputValue(), to: businessDateInputValue() });
  const [query, setQuery] = useState({ period: 'month' });
  const [data, setData] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    const request = warehouseId ? api.adminCollectionAccounting(warehouseId, query) : api.collectionAccounting(query);
    request.then(result => { if (!cancelled) setData(result); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [query, warehouseId]);
  const field = name => ({ value: draft[name], onChange: event => setDraft({ ...draft, [name]: event.target.value }) });
  const name = row => row.pharmacy ? displayName(row.pharmacy.nameEn, row.pharmacy.nameAr) : '—';
  const orderReference = row => warehouseId ? (row.invoiceNumber ?? row.orderNumber ?? row.orderId ?? '—')
    : <Link to={`/warehouse/orders/${encodeURIComponent(row.orderId)}`}>{row.invoiceNumber ?? row.orderNumber ?? t('accounting.openOrder')}</Link>;
  return <section className="wh-detail-card" aria-label={t('collectionAccounting.title')}>
    <h2>{t('collectionAccounting.title')}</h2>
    <p className="hint">{t('collectionAccounting.scope')}</p>
    <form className="wh-filters" onSubmit={event => {
      event.preventDefault();
      setQuery({ period: draft.period, ...(draft.search.trim() ? { search: draft.search.trim() } : {}),
        ...(draft.state ? { state: draft.state } : {}), ...(draft.period === 'custom' ? { from: draft.from, to: draft.to } : {}) });
    }}>
      <label>{t('accounting.period')}<select {...field('period')}>
        {['today', 'week', 'month', 'custom'].map(key => <option key={key} value={key}>{t(`accounting.period_${key}`)}</option>)}
      </select></label>
      {draft.period === 'custom' && <>
        <label>{t('accounting.from')}<input type="date" required max={draft.to} {...field('from')} /></label>
        <label>{t('accounting.to')}<input type="date" required min={draft.from} {...field('to')} /></label>
      </>}
      <label>{t('accounting.activityPharmacy')}<input type="search" maxLength={120} {...field('search')} /></label>
      <label>{t('collectionAccounting.invoices')}<select {...field('state')}>
        {['', 'open', 'partial', 'paid', 'void'].map(key => <option key={key} value={key}>{t(`collectionAccounting.${key || 'all'}`)}</option>)}
      </select></label>
      <button className="btn-primary" type="submit">{t('accounting.refresh')}</button>
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!error && !data && <p role="status">{t('common.loading')}</p>}
    {data && <>
      <p className="hint">{t('accounting.updatedAt')}: <time dateTime={data.asOf}>{formatBusinessDateTime(data.asOf)}</time> · Asia/Damascus</p>
      {data.summary && <>
        <dl className="wh-settlement-summary">{['original', 'feniq', 'rep', 'available', 'reserved', 'liability'].map((key, i) => {
          const source = ['originalSyp', 'feniqSyp', 'repSyp', 'returnCreditAvailableSyp', 'returnCreditReservedSyp', 'returnCreditLiabilitySyp'][i];
          return <div className="wh-settlement-tile" key={key}><dt>{t(`collectionAccounting.${key}`)}</dt><dd className="wh-num">{formatSyp(data.summary[source])}</dd></div>;
        })}</dl>
        <p>{['open', 'partial', 'paid', 'void'].map(state => <span key={state}> {t(`collectionAccounting.${state}`)}: <b>{data.summary.invoiceStates[state]}</b> </span>)}</p>
      </>}
      <h3>{t('collectionAccounting.invoices')}</h3>
      {!data.invoices.length ? <p>{t('collectionAccounting.noInvoices')}</p> : <div className="table-scroll"><table className="wh-table">
        <thead><tr>{['accounting.pharmacy', 'accounting.reference', 'collectionAccounting.invoices', 'collectionAccounting.cash', 'collectionAccounting.credit', 'collectionAccounting.outstanding', 'collectionAccounting.eligible', 'collectionAccounting.feniq', 'collectionAccounting.rep'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
        <tbody>{data.invoices.map(row => <tr key={row.id}>
          <td>{warehouseId ? name(row) : <Link to={`/warehouse/debts?pharmacy=${encodeURIComponent(row.pharmacyId)}`}>{name(row)}</Link>}</td>
          <td>{orderReference(row)}</td><td>{t(`collectionAccounting.${row.state}`)}</td>
          {['cashRecordedSyp', 'creditAppliedSyp', 'outstandingSyp', 'eligibleCollectedSyp', 'accruedFeniqSyp', 'accruedRepSyp'].map(key => <td className="wh-num" key={key}>{formatSyp(row[key])}</td>)}
        </tr>)}</tbody>
      </table></div>}
      {data.invoicePagination.hasMore && <button type="button" onClick={() => setQuery({ ...query, invoiceAfter: data.invoicePagination.nextCursor })}>{t('collectionAccounting.nextInvoices')}</button>}
      <h3>{t('collectionAccounting.events')}</h3><p className="hint">{t('collectionAccounting.reasons')}</p>
      {!data.events.length ? <p>{t('collectionAccounting.noEvents')}</p> : <div className="table-scroll"><table className="wh-table">
        <thead><tr>{['accounting.date', 'accounting.pharmacy', 'collectionAccounting.reference', 'collectionAccounting.original', 'collectionAccounting.feniq', 'collectionAccounting.rep'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
        <tbody>{data.events.map(row => <tr key={row.id}>
          <td>{formatBusinessDateTime(row.at)}</td><td>{name(row)}</td><td>{row.orderId && orderReference(row)}<div dir="ltr">{row.sourceKey}</div><div>{row.reason}</div></td>
          {['originalCommissionSyp', 'feniqSyp', 'repSyp'].map(key => <td className="wh-num" key={key}>{formatSyp(row[key])}</td>)}
        </tr>)}</tbody>
      </table></div>}
      {data.pagination.hasMore && <button type="button" onClick={() => setQuery({ ...query, after: data.pagination.nextCursor })}>{t('collectionAccounting.nextEvents')}</button>}
    </>}
  </section>;
}
