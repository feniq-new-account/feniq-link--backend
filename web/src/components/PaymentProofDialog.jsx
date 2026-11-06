import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useModalSafety } from '../hooks/useModalSafety';
import { hasRolePermission } from '../utils/userPermissions';
import { createIdempotencyKeys } from '../utils/payments';
import { formatSyp } from '../utils/currency';
import { formatBusinessDateTime } from '../utils/businessDate';

export function PaymentProofDialog({ payment, readOnly = false, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [before, setBefore] = useState(null);
  const [proofReference, setProofReference] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [keys] = useState(() => createIdempotencyKeys());
  const requestId = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const modal = useModalSafety(saving, onClose);
  const load = useCallback(async (cursor = null) => {
    const id = ++requestId.current;
    setLoading(true); setData(null); setError(null); setBefore(cursor);
    try {
      const response = await api.paymentProofs(payment.id, cursor);
      if (id === requestId.current) setData(response);
    } catch (err) {
      if (id === requestId.current) setError(err.message);
    } finally { if (id === requestId.current) setLoading(false); }
  }, [payment.id]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; ++requestId.current; };
  }, [load]);

  const latest = data?.rows?.[0];
  const current = data?.paymentStatus === 'posted' && before === null && !readOnly;
  const canSubmit = current && hasRolePermission(user, 'paymentRecord') && (!latest || latest.review?.decision === 'rejected');
  const canReview = current && hasRolePermission(user, 'paymentProofReview') && latest && !latest.review;

  async function mutate(payload, send) {
    if (busy.current || loading) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      await keys.submit(payload, send);
      if (mounted.current) { setProofReference(''); setNote(''); setReason(''); await load(); }
    } catch (err) {
      // A lost response is uncertain. Hide the old decision until a fresh
      // server read; the original request key survives retry/reopening.
      if (mounted.current) { setData(null); setError(err.message); }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    if (!canSubmit || !proofReference.trim()) return;
    const body = { proofReference: proofReference.trim(), note: note.trim() || null };
    return mutate({ operation: 'payment-proof', paymentId: payment.id, ...body },
      idempotencyKey => api.submitPaymentProof(payment.id, { ...body, idempotencyKey }));
  }
  function review(decision) {
    if (!canReview || (decision === 'rejected' && !reason.trim())) return;
    const body = { decision, reason: reason.trim() || null };
    return mutate({ operation: 'payment-proof-review', paymentId: payment.id, proofId: latest.id, ...body },
      idempotencyKey => api.reviewPaymentProof(payment.id, latest.id, { ...body, idempotencyKey }));
  }
  return <div className="modal-overlay" {...modal.overlayProps}>
    <div className="modal" {...modal.dialogProps} aria-busy={loading || saving} aria-label={t('paymentProof.title')}>
      <h2>{t('paymentProof.title')}</h2>
      <p className="hint">{t('paymentProof.explain')}</p>
      {loading && <p role="status">{t('common.loading')}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && <>
        <p className="hint">{t('paymentProof.updated')}: {formatBusinessDateTime(data.asOf)}</p>
        {data.paymentStatus === 'reversed' && <p role="status">{t('paymentProof.reversed')}</p>}
        {data.rows.length === 0 && <p>{t('paymentProof.empty')}</p>}
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {data.rows.map(row => <article className="wh-detail-card" key={row.id}>
            <p>{t('paymentProof.revision', { revision: row.revision })} — {formatSyp(row.amountSyp)}</p>
            <p>{t('paymentProof.cashTime')}: {formatBusinessDateTime(row.paidAt)}</p>
            <p style={{ overflowWrap: 'anywhere' }}>{row.proofReference}</p>
            {row.note && <p>{row.note}</p>}
            <p>{t(`paymentProof.${row.review?.decision || 'pending'}`)}</p>
            {row.review && <p>{formatBusinessDateTime(row.review.at)}</p>}
            {row.review?.reason && <p>{row.review.reason}</p>}
            {row.review?.decision === 'approved' && !row.effectiveApproval && <p>{t('paymentProof.ineffective')}</p>}
          </article>)}
        </div>
        {canSubmit && <form className="product-form" onSubmit={submit}>
          <label>{t('paymentProof.reference')}<input value={proofReference} maxLength={500} required disabled={saving}
            onChange={e => setProofReference(e.target.value)} /></label>
          <label>{t('paymentProof.note')}<textarea value={note} maxLength={1000} disabled={saving}
            onChange={e => setNote(e.target.value)} /></label>
          <button type="submit" className="btn-primary" disabled={saving}>{t('paymentProof.submit')}</button>
        </form>}
        {canReview && <div className="product-form">
          <label>{t('paymentProof.reason')}<textarea value={reason} maxLength={1000} disabled={saving}
            onChange={e => setReason(e.target.value)} /></label>
          <div className="modal-actions">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => review('approved')}>{t('paymentProof.approve')}</button>
            <button type="button" className="btn-reject" disabled={saving || !reason.trim()} onClick={() => review('rejected')}>{t('paymentProof.reject')}</button>
          </div>
        </div>}
        {data.hasMore && <button type="button" className="btn-secondary" disabled={saving} onClick={() => load(data.nextBefore)}>{t('paymentProof.older')}</button>}
      </>}
      <div className="modal-actions">
        <button type="button" className="btn-secondary" disabled={loading || saving} onClick={() => load()}>{t('paymentProof.refresh')}</button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={modal.close}>{t('common.close')}</button>
      </div>
    </div>
  </div>;
}
