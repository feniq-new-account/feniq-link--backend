import { CashCustodyPanel } from '../components/CashCustodyPanel';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LedgerMovementReference } from '../components/LedgerMovementReference';
import { SummaryFigures } from '../components/WarehouseSummaryCard';
import { WarehouseGroupSubNav } from '../components/WarehouseGroupSubNav';
import { useWarehouseSubscription } from '../context/WarehouseSubscriptionContext';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { formatBusinessDateTime, businessDateInputValue, startOfBusinessMonthInputValue } from '../utils/businessDate';
import { CollectionAccountingPanel } from '../components/CollectionAccountingPanel';
import './AccountantDashboardPage.css';

const KINDS = ['charge', 'charge_reversal', 'payment', 'payment_reversal', 'return_credit',
  'return_credit_reversal', 'return_credit_application', 'return_credit_application_reversal', 'manual_debit', 'manual_credit', 'adjustment_reversal', 'opening_balance', 'migration_adjustment'];
const KIND_KEYS = { charge: 'kindCharge', charge_reversal: 'kindChargeReversal', payment: 'kindPayment',
  payment_reversal: 'kindPaymentReversal', return_credit: 'kindReturnCredit', return_credit_reversal: 'kindReturnCreditReversal', return_credit_application: 'kindReturnCreditApplication', return_credit_application_reversal: 'kindReturnCreditApplicationReversal',
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

// Separate the editable filter draft from applied server query. The summary
// stays authoritative; table-only filters never recalculate financial KPIs.
const newAccountingDraft = () => ({
  period: 'month',
  kind: '',
  search: '',
  balanceState: '',
  from: startOfBusinessMonthInputValue(),
  to: businessDateInputValue(),
});

export function AccountantDashboardPage() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(newAccountingDraft);
  const [query, setQuery] = useState({ period: 'month' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api.accountantDashboard(query)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [query]);

  const field = (name) => ({
    value: draft[name],
    onChange: (event) => setDraft((current) => ({ ...current, [name]: event.target.value })),
  });
  const apply = (event) => {
    event.preventDefault();
    setQuery({
      period: draft.period,
      ...(draft.kind ? { kind: draft.kind } : {}),
      ...(draft.search.trim() ? { search: draft.search.trim() } : {}),
      ...(draft.balanceState ? { balanceState: draft.balanceState } : {}),
      ...(draft.period === 'custom' ? { from: draft.from, to: draft.to } : {}),
    });
  };
  const reset = () => {
    setDraft(newAccountingDraft());
    setQuery({ period: 'month' });
  };
  const loading = !error && !data;
  const hasAppliedFilters = query.period !== 'month' || !!query.kind || !!query.search || !!query.balanceState;

  return <div className="accountant-dashboard">
    <WarehouseGroupSubNav />
    <header className="accounting-hero">
      <div className="accounting-hero-heading">
        <div>
          <p className="accounting-eyebrow">{t('accounting.overviewLabel')}</p>
          <h1>{t('accounting.title')}</h1>
          <p className="accounting-hero-caption">{t('accounting.overviewHint')}</p>
        </div>
        {data && <div className="accounting-freshness" aria-label={t('accounting.updatedAt')}>
          <span className="accounting-freshness-dot" aria-hidden="true" />
          <span>{t('accounting.updatedAt')}</span>
          <time dateTime={data.asOf}>{formatBusinessDateTime(data.asOf)}</time>
          <small>Asia/Damascus</small>
        </div>}
      </div>
      <nav className="accounting-links" aria-label={t('accounting.shortcuts')}>
        <Link to="/warehouse/debts">{t('nav.debts')}</Link>
        <Link to="/warehouse/settlement">{t('nav.settlement')}</Link>
        <Link to="/warehouse/returns">{t('nav.returns')}</Link>
      </nav>
    </header>

    <section className="accounting-filter-panel" aria-labelledby="accounting-filter-title">
      <div className="accounting-section-heading">
        <div>
          <h2 id="accounting-filter-title">{t('accounting.filterTitle')}</h2>
          <p className="hint">{t('accounting.filterHint')}</p>
        </div>
        {hasAppliedFilters && <span className="accounting-filter-active">{t('accounting.filtersApplied')}</span>}
      </div>
      <form className="wh-filters accounting-filter-grid" onSubmit={apply} aria-label={t('accounting.filterTitle')}>
        <label>{t('accounting.period')}
          <select {...field('period')}>
            {['today', 'week', 'month', 'custom'].map((key) =>
              <option key={key} value={key}>{t('accounting.period_' + key)}</option>)}
          </select>
        </label>
        {draft.period === 'custom' && <>
          <label>{t('accounting.from')}<input type="date" required max={draft.to} {...field('from')} /></label>
          <label>{t('accounting.to')}<input type="date" required min={draft.from} {...field('to')} /></label>
        </>}
        <label>{t('accounting.activityPharmacy')}<input type="search" maxLength={120} {...field('search')} /></label>
        <label>{t('accounting.activityBalance')}
          <select {...field('balanceState')}>
            {['', 'debt', 'credit', 'settled'].map((state) =>
              <option key={state} value={state}>{t('statement.balanceState_' + (state || 'all'))}</option>)}
          </select>
        </label>
        <label>{t('accounting.activityType')}
          <select {...field('kind')}>
            <option value="">{t('accounting.allKinds')}</option>
            {KINDS.map((kind) => <option key={kind} value={kind}>{t('statement.' + KIND_KEYS[kind])}</option>)}
          </select>
        </label>
        <div className="accounting-filter-actions">
          <button className="btn-primary" type="submit">{t('accounting.refresh')}</button>
          <button className="accounting-reset" type="button" onClick={reset}>{t('accounting.resetFilters')}</button>
        </div>
      </form>
    </section>

    {error && <section className="accounting-feedback accounting-feedback-error" role="alert">
      <strong>{t('accounting.loadFailed')}</strong>
      <p>{error}</p>
      <button type="button" className="accounting-reset" onClick={() => setQuery((current) => ({ ...current }))}>
        {t('common.retry')}
      </button>
    </section>}
    {loading && <div role="status" className="accounting-feedback accounting-loading">
      <span className="accounting-spinner" aria-hidden="true" />
      <span>{t('common.loading')}</span>
    </div>}

    {data && <>
      <section className="accounting-overview" aria-label={t('accounting.overviewLabel')}>
        <div className="accounting-section-heading">
          <div>
            <h2>{t('accounting.overviewLabel')}</h2>
            <p className="hint">{t('accounting.scope')} {formatBusinessDateTime(data.summary.period.from)} — {formatBusinessDateTime(data.summary.period.to)}</p>
          </div>
        </div>
        <SummaryFigures summary={data.summary} />
        <p className="accounting-ledger-note">{t('accounting.invoiceNote')}</p>
      </section>
      <section className="accounting-activity" aria-labelledby="accounting-activity-title">
        <div className="accounting-section-heading">
          <div>
            <h2 id="accounting-activity-title">{t('accounting.activity')}</h2>
            <p className="hint">{t('accounting.activityScope')}</p>
          </div>
        </div>
        {!data.activity.length
          ? <div className="accounting-empty">
              <span aria-hidden="true">◫</span>
              <p>{t('accounting.noActivity')}</p>
              {hasAppliedFilters && <button type="button" className="accounting-reset" onClick={reset}>{t('accounting.resetFilters')}</button>}
            </div>
          : <div className="wh-card table-scroll accounting-activity-table">
              <table className="wh-table">
                <thead>
                  <tr>{['date', 'pharmacy', 'type', 'reference', 'debit', 'credit'].map((key) =>
                    <th key={key} scope="col">{t('accounting.' + key)}</th>)}</tr>
                </thead>
                <tbody>
                  {data.activity.map((row) => <tr key={row.id}>
                    <td className="wh-num" data-label={t('accounting.date')}>
                      <time dateTime={row.effectiveAt}>{formatBusinessDateTime(row.effectiveAt)}</time>
                      <div className="wh-table-sub">{t('accounting.postedAt')}: {formatBusinessDateTime(row.postedAt)}</div>
                    </td>
                    <td data-label={t('accounting.pharmacy')}>
                      <Link className="accounting-pharmacy-link" to={'/warehouse/debts?pharmacy=' + row.pharmacyId}>
                        {row.pharmacy ? displayName(row.pharmacy.nameEn, row.pharmacy.nameAr) : t('accounting.unavailablePharmacy')}
                      </Link>
                    </td>
                    <td data-label={t('accounting.type')}>
                      <span className="accounting-movement-kind">{t('statement.' + (KIND_KEYS[row.kind] || 'kindOther'))}</span>
                      {row.reason && <div className="wh-table-sub">{row.reason}</div>}
                    </td>
                    <td data-label={t('accounting.reference')}><LedgerMovementReference row={row} /></td>
                    <td className="wh-num accounting-debit" data-label={t('accounting.debit')}>
                      {row.direction === 'debit' ? formatSyp(row.amountSyp) : '—'}
                    </td>
                    <td className="wh-num accounting-credit" data-label={t('accounting.credit')}>
                      {row.direction === 'credit' ? formatSyp(row.amountSyp) : '—'}
                    </td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
        {data.activityHasMore && <p className="accounting-more-note">{t('accounting.activityLimit')}</p>}
      </section>
    </>}
    {data?.collectionAccounting && <div className="accounting-v2-section"><CollectionAccountingPanel /><CashCustodyPanel /></div>}
    <OverduePreview key={JSON.stringify(query)} />
  </div>;
}
