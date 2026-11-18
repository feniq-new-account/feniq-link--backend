import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { businessDateInputValue, formatBusinessDateTime } from '../utils/businessDate';

// "Today's receipts": what came in on one business day - total, by method,
// and by who recorded it (the manager records payments too since
// 2026-11-17). Read-only; a reversed payment is listed but not totalled.
// A reversal is shown as a minus on the day it is dated; a payment reversed
// later stays on its own day, struck through.
function ReceiptsTable({ rows, t }) {
  return <div className="wh-card table-scroll"><table className="wh-table">
    <thead><tr>{['time', 'pharmacy', 'method', 'by', 'amount'].map((key) =>
      <th key={key} scope="col">{t('accounting.receipts.col_' + key)}</th>)}</tr></thead>
    <tbody>{rows.map((p) => <tr key={p.id} className={p.status === 'reversed' ? 'is-reversed' : undefined}>
      <td className="wh-num" data-label={t('accounting.receipts.col_time')}>{formatBusinessDateTime(p.paidAt)}</td>
      <td data-label={t('accounting.receipts.col_pharmacy')}>{p.pharmacy ? displayName(p.pharmacy.nameEn, p.pharmacy.nameAr) : '—'}</td>
      <td data-label={t('accounting.receipts.col_method')}>
        {p.kind === 'reversal' ? t('accounting.receipts.reversal') : t('accounting.receipts.method_' + p.method)}
      </td>
      <td data-label={t('accounting.receipts.col_by')}>{p.recordedBy?.name || '—'}</td>
      <td className="wh-num" data-label={t('accounting.receipts.col_amount')}>
        {p.amountSyp == null ? '—' : p.kind === 'reversal' ? <bdi>−{formatSyp(p.amountSyp)}</bdi>
          : p.status === 'reversed'
            ? <><s>{formatSyp(p.amountSyp)}</s> <span className="wh-table-sub">{t('accounting.receipts.reversedLater')}</span></>
            : formatSyp(p.amountSyp)}
      </td>
    </tr>)}</tbody>
  </table></div>;
}

export function DailyReceiptsCard() {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => businessDateInputValue());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    api.dailyReceipts(date)
      .then((result) => { if (!cancelled) setData(result.receipts); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [date]);

  return <section className="wh-detail-card daily-receipts" aria-labelledby="daily-receipts-title">
    <div className="accounting-section-heading">
      <div>
        <h2 id="daily-receipts-title">{t('accounting.receipts.title')}</h2>
        <p className="hint">{t('accounting.receipts.hint')}</p>
      </div>
      <label>{t('accounting.receipts.day')}
        <input type="date" value={date} max={businessDateInputValue()} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </label>
    </div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!data && !error && <p role="status" className="hint">{t('common.loading')}</p>}
    {data && <>
      <div className="wh-invoice-summary wh-summary-stats" data-testid="daily-receipts-total">
        <div className="wh-invoice-stat">
          <div className="wh-invoice-stat-label">{t('accounting.receipts.net')}</div>
          <div className="wh-invoice-stat-value wh-num is-paid">{formatSyp(data.netSyp)}</div>
          <div className="wh-summary-sub">{t('accounting.receipts.received')}: <bdi className="wh-num">{formatSyp(data.receivedSyp)}</bdi> · {data.receivedCount}</div>
          {data.reversedCount > 0 && <div className="wh-summary-sub">
            {t('accounting.receipts.reversedTotal')}: <bdi className="wh-num">−{formatSyp(data.reversedSyp)}</bdi> · {data.reversedCount}
          </div>}
        </div>
        {Object.entries(data.byMethod).map(([method, amount]) => <div className="wh-invoice-stat" key={method}>
          <div className="wh-invoice-stat-label">{t('accounting.receipts.methodReceived', { method: t('accounting.receipts.method_' + method) })}</div>
          <div className="wh-invoice-stat-value wh-num">{formatSyp(amount)}</div>
        </div>)}
      </div>
      {data.byRecorder.length > 0 && <ul className="daily-receipts-recorders" data-testid="daily-receipts-recorders">
        {data.byRecorder.map((r) => <li key={r.userId}>
          {r.name || '—'} ({t('accounting.receipts.role_' + (r.role || 'legacy'))}): <bdi className="wh-num">{formatSyp(r.amountSyp)}</bdi> · {t('accounting.receipts.payments', { count: r.count })}
        </li>)}
      </ul>}
      {data.unknownAmountCount > 0 && <p className="hint" role="status">{t('accounting.receipts.unknown', { count: data.unknownAmountCount })}</p>}
      {data.payments.length === 0
        ? <p className="accounting-empty">{t('accounting.receipts.none')}</p>
        : <ReceiptsTable rows={data.payments} t={t} />}
      {data.truncated && <p className="hint">{t('accounting.receipts.truncated')}</p>}
      {data.enteredTodayDatedEarlier.length > 0 && <div data-testid="daily-receipts-backdated">
        <p className="hint">{t('accounting.receipts.backdated', { count: data.enteredTodayDatedEarlier.length })}</p>
        <ReceiptsTable rows={data.enteredTodayDatedEarlier} t={t} />
      </div>}
    </>}
  </section>;
}
