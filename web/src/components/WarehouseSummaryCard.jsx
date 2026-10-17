import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';

// The owner's at-a-glance summary at the top of the Invoices tab. Every figure
// is a sum of ledger entries the server already netted (reversals included),
// so nothing here is computed from the pharmacy list below it.

const PERIODS = [
  { key: 'today', labelKey: 'whSummary.periodToday' },
  { key: 'week', labelKey: 'whSummary.periodWeek' },
  { key: 'month', labelKey: 'whSummary.periodMonth' },
];

// Percent change against the previous period of equal length, or null when
// there is nothing to compare with (previous period empty).
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Change({ current, previous }) {
  const { t } = useTranslation();
  const percent = percentChange(current, previous);
  if (percent === null) {
    return current > 0 ? <div className="wh-summary-change">{t('whSummary.changeNew')}</div> : null;
  }
  if (percent === 0) return <div className="wh-summary-change">{t('whSummary.changeFlat')}</div>;
  const up = percent > 0;
  return (
    <div className={`wh-summary-change ${up ? 'is-up' : 'is-down'}`}>
      {t(up ? 'whSummary.changeUp' : 'whSummary.changeDown', { percent: Math.abs(percent) })}
    </div>
  );
}

function RankedList({ title, rows, emptyText }) {
  return (
    <div className="wh-detail-card wh-summary-list">
      <h2 className="wh-detail-card-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="hint">{emptyText}</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.id} className="wh-summary-row">
              <span className="wh-summary-rank">{row.rank}</span>
              <span className="wh-summary-name">{row.name}</span>
              <span className="wh-num">{formatSyp(row.amountSyp)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The figures themselves, separate from fetching so they render from a plain
// `summary` object (the shape of GET /warehouse/balances/summary).
export function SummaryFigures({ summary }) {
  const { t } = useTranslation();
  const { current, previous, topBuyers, outstanding } = summary;

  const buyers = topBuyers.map((row, i) => ({
    id: String(row.pharmacy.id),
    rank: i + 1,
    name: displayName(row.pharmacy.nameEn, row.pharmacy.nameAr),
    amountSyp: row.salesSyp,
  }));
  const debtors = outstanding.topDebtors.map((row, i) => ({
    id: String(row.pharmacy.id),
    rank: i + 1,
    name: displayName(row.pharmacy.nameEn, row.pharmacy.nameAr),
    amountSyp: row.balanceSyp,
  }));

  return (
    <>
      <div className="wh-invoice-summary wh-summary-stats">
        <div className="wh-invoice-stat">
          <div className="wh-invoice-stat-label">{t('whSummary.sales')}</div>
          <div className="wh-invoice-stat-value wh-num">{formatSyp(current.salesSyp)}</div>
          <div className="wh-summary-sub">{t('whSummary.invoiceCount', { count: current.invoiceCount })}</div>
          <Change current={current.salesSyp} previous={previous.salesSyp} />
        </div>
        <div className="wh-invoice-stat">
          <div className="wh-invoice-stat-label">{t('whSummary.collections')}</div>
          <div className="wh-invoice-stat-value wh-num is-paid">{formatSyp(current.collectionsSyp)}</div>
          <div className="wh-summary-sub">{t('whSummary.paymentCount', { count: current.paymentCount })}</div>
          <Change current={current.collectionsSyp} previous={previous.collectionsSyp} />
        </div>
        <div className="wh-invoice-stat">
          <div className="wh-invoice-stat-label">{t('whSummary.returns')}</div>
          <div className="wh-invoice-stat-value wh-num">{formatSyp(current.returnsSyp)}</div>
        </div>
        <div className="wh-invoice-stat">
          <div className="wh-invoice-stat-label">{t('whSummary.totalDebts')}</div>
          <div className="wh-invoice-stat-value wh-num is-debt">{formatSyp(outstanding.totalDebtSyp)}</div>
          <div className="wh-summary-sub">{t('whSummary.debtorCount', { count: outstanding.debtorCount })}</div>
          {outstanding.totalCreditSyp > 0 && (
            <div className="wh-summary-sub">
              {t('whSummary.creditHeld', { amount: formatSyp(outstanding.totalCreditSyp) })}
            </div>
          )}
        </div>
      </div>

      <div className="wh-summary-lists">
        <RankedList title={t('whSummary.topBuyers')} rows={buyers} emptyText={t('whSummary.noBuyers')} />
        <RankedList title={t('whSummary.topDebtors')} rows={debtors} emptyText={t('whSummary.noDebtors')} />
      </div>
    </>
  );
}

export function WarehouseSummaryCard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('today');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Switching period quickly must not let a slow earlier answer overwrite
    // the one the owner is now looking at.
    let cancelled = false;
    setError(null);
    api
      .warehouseSummary({ period })
      .then((data) => {
        if (!cancelled) setSummary(data.summary);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('whSummary.loadError'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <section className="wh-summary" aria-label={t('whSummary.title')}>
      <div className="wh-summary-head">
        <h2 className="wh-summary-title">{t('whSummary.title')}</h2>
        <div className="wh-pills wh-summary-pills" role="group" aria-label={t('whSummary.title')}>
          {PERIODS.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              className={`wh-pill${period === key ? ' active' : ''}`}
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!error && !summary && <p className="hint">{t('common.loading')}</p>}
      {summary && <SummaryFigures summary={summary} />}

      <p className="wh-table-hint">{t('whSummary.deliveredNote')}</p>
    </section>
  );
}
