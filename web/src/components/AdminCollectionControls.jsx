import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { newIdempotencyKey } from '../utils/payments';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { businessDateInputValue, formatBusinessDateTime } from '../utils/businessDate';

// Persist the exact on-wire request, not only its key. A successful write can
// lose its HTTP response and change the next GET's revision/candidate list.
function accountScope() {
  try {
    const token = localStorage.getItem('phoenix.admin.token');
    const encoded = token?.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    return encoded ? JSON.parse(atob(encoded)).sub || 'anonymous' : 'anonymous';
  } catch { return 'anonymous'; }
}
function pendingStore(warehouseId, operation) {
  const key = `feniq.collection-pending:${encodeURIComponent(accountScope())}:${encodeURIComponent(warehouseId)}:${operation}`;
  return {
    read() {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        return value?.body && typeof value.body.idempotencyKey === 'string' && value.body.idempotencyKey ? value.body : null;
      } catch { return null; }
    },
    write(body) { try { localStorage.setItem(key, JSON.stringify({ body })); } catch { /* Storage unavailable: current attempt can still run. */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* Storage unavailable. */ } },
  };
}
const CONTRACT = 'collection-contract';
const SETTLEMENT = 'collection-weekly-settlement';

// Explicit platform operations, never mounted for warehouse users. The server
// independently validates permissions, frozen terms and every receipt source.
export function AdminCollectionControls({ warehouseId }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => businessDateInputValue(new Date(Date.now() - 6 * 86400000))), [to, setTo] = useState(businessDateInputValue());
  const [query, setQuery] = useState({ period: 'custom', from, to });
  const [data, setData] = useState(null), [error, setError] = useState(null), [success, setSuccess] = useState(null);
  const [selected, setSelected] = useState([]), [reference, setReference] = useState('');
  const [agreement, setAgreement] = useState(''), [deliveryFee, setDeliveryFee] = useState(''), [newOnly, setNewOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(() => ({ [CONTRACT]: pendingStore(warehouseId, CONTRACT).read(), [SETTLEMENT]: pendingStore(warehouseId, SETTLEMENT).read() }));
  const requestId = useRef(0), busy = useRef(false);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setData(null); setError(null); setSelected([]);
    try {
      const value = await api.adminCollectionAccounting(warehouseId, query);
      if (id === requestId.current) setData(value);
    } catch (err) { if (id === requestId.current) setError(err.message); throw err; }
  }, [warehouseId, query]);
  useEffect(() => {
    setPending({ [CONTRACT]: pendingStore(warehouseId, CONTRACT).read(), [SETTLEMENT]: pendingStore(warehouseId, SETTLEMENT).read() });
    setSuccess(null); setAgreement(''); setNewOnly(false);
    load().catch(() => {});
    return () => { ++requestId.current; };
  }, [load]);
  async function mutate(operation, requestedBody) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null); setSuccess(null);
    const store = pendingStore(warehouseId, operation);
    // Existing uncertain request takes precedence over newly edited form data.
    const body = store.read() || { ...requestedBody, idempotencyKey: newIdempotencyKey() };
    try {
      store.write(body);
      setPending(previous => ({ ...previous, [operation]: body }));
      if (operation === CONTRACT) await api.activateCollectionContract(warehouseId, body);
      else await api.confirmCollectionSettlement(warehouseId, body);
      store.clear();
      setPending(previous => ({ ...previous, [operation]: null }));
      // A failed follow-up GET must not turn a confirmed POST into a retry.
      try { await load(); } catch { /* load already reports the read error */ }
      setSuccess(t(`collectionControls.${operation === CONTRACT ? 'contractSaved' : 'settlementSaved'}`));
      setReference(''); setAgreement(''); setNewOnly(false);
    } catch (err) { setData(null); setError(err.message); }
    finally { busy.current = false; setSaving(false); }
  }
  function activate(event) {
    event.preventDefault();
    const fee = deliveryFee === '' ? null : Number(deliveryFee);
    if (!newOnly || !agreement.trim() || (fee !== null && (!Number.isSafeInteger(fee) || fee < 0))) return;
    const body = { agreementReference: agreement.trim(), basis: 'net_pharmacy_invoice', deliveryFeeSyp: fee,
      expectedRevision: data.summary?.contractRevision ?? 0 };
    return mutate(CONTRACT, body);
  }
  function confirm(event) {
    event.preventDefault();
    if (!selected.length || !reference.trim()) return;
    const body = { periodFrom: data.period.from, periodTo: data.period.to,
      proofReviewIds: [...selected].sort(), reference: reference.trim() };
    return mutate(SETTLEMENT, body);
  }
  return <section className="adm-detail-card" aria-label={t('collectionControls.title')}>
    <h2>{t('collectionControls.title')}</h2>
    <form className="adm-filters-row" onSubmit={event => { event.preventDefault(); setQuery({ period: 'custom', from, to }); }}>
      <label>{t('settlement.from')}<input type="date" required value={from} max={to} disabled={saving} onChange={e => setFrom(e.target.value)} /></label>
      <label>{t('settlement.to')}<input type="date" required value={to} min={from} disabled={saving} onChange={e => setTo(e.target.value)} /></label>
      <button type="submit" disabled={saving}>{t('accounting.refresh')}</button>
    </form>
    {Object.entries(pending).filter(([, body]) => body).map(([operation]) => <button key={operation} type="button" disabled={saving} onClick={() => mutate(operation)}>{t(operation === CONTRACT ? 'collectionControls.retryContract' : 'collectionControls.retrySettlement')}</button>)}
    {error && <p role="alert" className="error-text">{error}</p>}
    {success && <p role="status">{success}</p>}
    {!error && !data && <p role="status">{t('common.loading')}</p>}
    {data && <>
      <p className="hint">{t('accounting.updatedAt')}: <time dateTime={data.asOf}>{formatBusinessDateTime(data.asOf)}</time></p>
      <p>{t('collectionControls.revision')}: {data.summary?.contractRevision ?? 0}</p>
      <details><summary>{t('collectionControls.contract')}</summary>
        <p className="hint">{t('collectionControls.contractNote')}</p>
        <form className="product-form" onSubmit={activate}>
          <label>{t('collectionControls.agreement')}<input required maxLength={500} value={agreement} disabled={saving} onChange={e => setAgreement(e.target.value)} /></label>
          <label>{t('collectionControls.deliveryFee')}<input type="number" min="0" step="1" value={deliveryFee} disabled={saving} onChange={e => setDeliveryFee(e.target.value)} /></label>
          <label><input type="checkbox" required checked={newOnly} disabled={saving} onChange={e => setNewOnly(e.target.checked)} />{t('collectionControls.newOnly')}</label>
          <button type="submit" disabled={saving || !newOnly || !!pending[CONTRACT]}>{t('collectionControls.activate')}</button>
        </form>
      </details>
      {data.summary && <>
        <h3>{t('collectionControls.weekly')}</h3><p className="hint">{t('collectionControls.weeklyNote')}</p>
        <p>{formatBusinessDateTime(data.period.from)} — {formatBusinessDateTime(data.period.to)}</p>
        {!data.settlementCandidates.rows.length ? <p>{t('collectionControls.noCandidates')}</p> : <form onSubmit={confirm}>
          <div className="table-scroll"><table className="adm-table"><thead><tr>{['collectionControls.select', 'accounting.pharmacy', 'accounting.date', 'collectionAccounting.cash', 'collectionAccounting.reference'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead>
            <tbody>{data.settlementCandidates.rows.map(row => <tr key={row.id}>
              <td><input aria-label={`${t('collectionControls.select')} ${row.proofReference}`} type="checkbox" disabled={saving} checked={selected.includes(row.id)}
                onChange={e => setSelected(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} /></td>
              <td>{row.pharmacy ? displayName(row.pharmacy.nameEn, row.pharmacy.nameAr) : '—'}</td>
              <td>{formatBusinessDateTime(row.paidAt)}</td><td className="adm-num">{formatSyp(row.amountSyp)}</td>
              <td>{row.proofReference}<div dir="ltr">{row.paymentId}</div></td>
            </tr>)}</tbody></table></div>
          <label>{t('collectionControls.settlementReference')}<input required maxLength={500} value={reference} disabled={saving} onChange={e => setReference(e.target.value)} /></label>
          <button type="submit" disabled={saving || !selected.length || !!pending[SETTLEMENT]}>{t('collectionControls.confirm')}</button>
        </form>}
        {data.settlementCandidates.hasMore && <button disabled={saving} onClick={() => setQuery({ ...query, candidateAfter: data.settlementCandidates.nextCursor })}>{t('common.loadMore')}</button>}
      </>}
    </>}
  </section>;
}
