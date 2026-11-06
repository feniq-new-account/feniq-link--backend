import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { SummaryFigures } from '../components/WarehouseSummaryCard';
import { WarehouseGroupSubNav } from '../components/WarehouseGroupSubNav';
import { useWarehouseSubscription } from '../context/WarehouseSubscriptionContext';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { formatBusinessDateTime, businessDateInputValue, startOfBusinessMonthInputValue } from '../utils/businessDate';
import './AccountantDashboardPage.css';

const KINDS = ['charge', 'charge_reversal', 'payment', 'payment_reversal', 'return_credit',
  'return_credit_reversal', 'manual_debit', 'manual_credit', 'adjustment_reversal', 'opening_balance', 'migration_adjustment'];
const KIND_KEYS = { charge: 'kindCharge', charge_reversal: 'kindChargeReversal', payment: 'kindPayment',
  payment_reversal: 'kindPaymentReversal', return_credit: 'kindReturnCredit', return_credit_reversal: 'kindReturnCreditReversal',
  manual_debit: 'kindManualDebit', manual_credit: 'kindManualCredit', opening_balance: 'kindOpeningBalance',
  migration_adjustment: 'kindMigrationAdjustment', adjustment_reversal: 'kindOther' };

function OverduePreview() {
  const { t } = useTranslation();
  const { hasFeature, loading } = useWarehouseSubscription();
  const enabled = !loading && hasFeature('overdueReceivables');
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (enabled) {
      setState(null);
      api.warehouseFollowUp({ kind: 'overdue', limit: 5, force: true })
        .then((data) => { if (!cancelled) setState({ data }); })
        .catch((error) => { if (!cancelled) setState({ error: error.message }); });
    }
    return () => { cancelled = true; };
  }, [enabled]);
  if (!enabled) return null;
  return <section className="wh-detail-card" aria-label={t('accounting.overdue')}>
    <h2>{t('accounting.overdue')}</h2>
    <p className="hint">{t('accounting.agingNote')}</p>
    {!state && <p role="status">{t('common.loading')}</p>}
    {state?.error && <p role="alert" className="error-text">{state.error}</p>}
    {state?.data && <>
      <p className="hint">{t('accounting.updatedAt')}: {state.data.asOfBusiness} · Asia/Damascus</p>
      {state.data.rows.length === 0 && <p>{t('accounting.noOverdue')}</p>}
      <ul>{state.data.rows.map((row) => <li key={row.pharmacy.id}>
        <Link to={`/warehouse/debts?pharmacy=${row.pharmacy.id}`}>{displayName(row.pharmacy.nameEn, row.pharmacy.nameAr)}</Link>
        {' — '}<span className="wh-num">{formatSyp(row.overdueSyp)}</span>
      </li>)}</ul>
      <Link to="/warehouse/insights?tab=overdue">{t('accounting.allOverdue')}</Link>
    </>}
  </section>;
}

export function AccountantDashboardPage() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ period: 'month', kind: '', from: startOfBusinessMonthInputValue(), to: businessDateInputValue() });
  const [query, setQuery] = useState({ period: 'month' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    api.accountantDashboard(query).then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [query]);
  const field = (name) => ({ value: draft[name], onChange: (event) => setDraft({ ...draft, [name]: event.target.value }) });
  return <div className="accountant-dashboard">
    <WarehouseGroupSubNav />
    <h1>{t('accounting.title')}</h1>
    <nav className="accounting-links" aria-label={t('accounting.shortcuts')}>
      <Link to="/warehouse/debts">{t('nav.debts')}</Link>
      <Link to="/warehouse/settlement">{t('nav.settlement')}</Link>
      <Link to="/warehouse/returns">{t('nav.returns')}</Link>
    </nav>
    <form className="wh-filters" onSubmit={(event) => {
      event.preventDefault();
      setQuery({ period: draft.period, ...(draft.kind ? { kind: draft.kind } : {}),
        ...(draft.period === 'custom' ? { from: draft.from, to: draft.to } : {}) });
    }}>
      <label>{t('accounting.period')}<select {...field('period')}>
        {['today', 'week', 'month', 'custom'].map((key) => <option key={key} value={key}>{t(`accounting.period_${key}`)}</option>)}
      </select></label>
      {draft.period === 'custom' && <>
        <label>{t('accounting.from')}<input type="date" required max={draft.to} {...field('from')} /></label>
        <label>{t('accounting.to')}<input type="date" required min={draft.from} {...field('to')} /></label>
      </>}
      <label>{t('accounting.activityType')}<select {...field('kind')}>
        <option value="">{t('accounting.allKinds')}</option>
        {KINDS.map((kind) => <option key={kind} value={kind}>{t(`statement.${KIND_KEYS[kind]}`)}</option>)}
      </select></label>
      <button className="btn-primary" type="submit">{t('accounting.refresh')}</button>
    </form>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!error && !data && <p role="status">{t('common.loading')}</p>}
    {data && <>
      <p className="hint">{t('accounting.updatedAt')}: <time dateTime={data.asOf}>{formatBusinessDateTime(data.asOf)}</time> · Asia/Damascus</p>
      <p className="hint">{t('accounting.scope')} {formatBusinessDateTime(data.summary.period.from)} — {formatBusinessDateTime(data.summary.period.to)}</p>
      <SummaryFigures summary={data.summary} />
      <p className="hint">{t('accounting.invoiceNote')}</p>
      <section aria-label={t('accounting.activity')}>
        <h2>{t('accounting.activity')}</h2>
        <p className="hint">{t('accounting.activityScope')}</p>
        {!data.activity.length ? <p>{t('accounting.noActivity')}</p> : <div className="wh-card table-scroll"><table className="wh-table">
          <thead><tr>{['date', 'pharmacy', 'type', 'reference', 'debit', 'credit'].map((key) => <th key={key}>{t(`accounting.${key}`)}</th>)}</tr></thead>
          <tbody>{data.activity.map((row) => <tr key={row.id}>
            <td className="wh-num">{formatBusinessDateTime(row.effectiveAt)}<div className="wh-table-sub">{t('accounting.postedAt')}: {formatBusinessDateTime(row.postedAt)}</div></td>
            <td><Link to={`/warehouse/debts?pharmacy=${row.pharmacyId}`}>{row.pharmacy ? displayName(row.pharmacy.nameEn, row.pharmacy.nameAr) : t('accounting.unavailablePharmacy')}</Link></td>
            <td>{t(`statement.${KIND_KEYS[row.kind] || 'kindOther'}`)}{row.reason && <div className="wh-table-sub">{row.reason}</div>}</td>
            <td className="wh-num">LE-{row.entryNumber}
              {row.reference?.invoiceNumber != null && <div>{t('settlement.invoiceNumber', { number: row.reference.invoiceNumber })}</div>}
              {row.reference?.paymentNumber != null && <div>{t('debts.paymentNumber', { number: row.reference.paymentNumber })}</div>}
            </td>
            <td className="wh-num">{row.direction === 'debit' ? formatSyp(row.amountSyp) : '—'}</td>
            <td className="wh-num">{row.direction === 'credit' ? formatSyp(row.amountSyp) : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
        {data.activityHasMore && <p className="hint">{t('accounting.activityLimit')}</p>}
      </section>
    </>}
    <OverduePreview key={JSON.stringify(query)} />
  </div>;
}
