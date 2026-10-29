import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export function DeliveryEstimate({ estimate, status, orderId, onChanged }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(null), [editing, setEditing] = useState(false);
  const [expectedBusiness, setExpected] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const base = Date.parse(estimate?.observedAt), end = Date.parse(estimate?.to), started = performance.now();
    if (!Number.isFinite(base) || !Number.isFinite(end)) return;
    const update = () => setRemaining(Math.max(0, end - base - (performance.now() - started)));
    update(); const timer = setInterval(update, 30000); return () => clearInterval(timer);
  }, [estimate]);
  if (!estimate) return null;
  const terminal = ['delivered', 'cancelled'].includes(status);
  const late = !terminal && (estimate.state === 'late' || remaining === 0);
  async function reschedule(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await api.rescheduleDelivery(orderId, { expectedBusiness, reason, revision: estimate.revision || 0 }); setEditing(false); await onChanged?.(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className={`delivery-window ${late ? 'late' : ''}`} aria-label={t('delivery.arrivalTitle')}>
    <h2>{t('delivery.arrivalTitle')}</h2>
    {estimate.unavailable ? <p>{t('delivery.unavailable')}</p> : <>
      <p>{estimate.zoneName}</p>
      <p>{t('delivery.range')} <time>{estimate.fromBusiness}</time> — <time>{estimate.toBusiness}</time> · {t('insights.damascus')}</p>
      {terminal ? <p>{t(`delivery.${status}`)}</p> : late ? <p role="status">{t('delivery.late')}</p> : remaining !== null && <p>{t('delivery.until')}: <bdi>{t('delivery.remaining',{hours:Math.floor(remaining / 3600000),minutes:Math.floor(remaining / 60000) % 60})}</bdi></p>}
      {estimate.reason && <p>{t('delivery.changed')}: {estimate.reason}</p>}
      {estimate.history?.length > 0 && <details><summary>{t('delivery.changed')}</summary>{estimate.history.map((row, i) => <p key={i}><time>{row.fromBusiness}</time> — <time>{row.toBusiness}</time>{row.reason ? ` · ${row.reason}` : ''}</p>)}</details>}
      {orderId && !terminal && <button type="button" onClick={() => { setEditing(!editing); setExpected(estimate.expectedBusiness?.replace(' ', 'T') || ''); }}>{t('delivery.reschedule')}</button>}
      {editing && !terminal && <form onSubmit={reschedule}><fieldset disabled={busy}><label>{t('delivery.newTime')}<input type="datetime-local" dir="ltr" required value={expectedBusiness} onChange={(event) => setExpected(event.target.value)} /></label><label>{t('delivery.reason')}<input maxLength={300} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button type="submit">{t('delivery.save')}</button><button type="button" onClick={() => setEditing(false)}>{t('common.cancel')}</button></fieldset></form>}
    </>}
  </section>;
}
