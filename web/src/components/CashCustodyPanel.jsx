import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { cashPendingRequests } from '../utils/cashPendingRequests';
import { newIdempotencyKey } from '../utils/payments';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import { formatBusinessDateTime } from '../utils/businessDate';

export function CashCustodyPanel({ warehouseId }) {
  const auth = useAuth();
  const scope = warehouseId || auth?.warehouse?.id;
  if (!auth?.user?.id || !scope) return null;
  return <CashCustodyContent key={`${auth.user.id}:${scope}`} accountId={auth.user.id} scope={scope} adminWarehouseId={warehouseId} />;
}
function Trace({ result, t }) {
  return <details><summary>{t('cashCustody.sources')}</summary>
    {(result?.blockers || []).map(b => <p key={`${b.accountId}:${b.code}`}>{b.accountId}: {t(`cashCustody.blockers.${b.code}`, { defaultValue: b.code })}</p>)}
    {(result?.accounts || []).map(account => <section key={account.accountId}>
      <p>{t('cashCustody.allocationRun')}: {account.allocationRunId} · {t('cashCustody.ledgerSequence')}: {account.ledgerSequence}</p>
      {account.rows.map(row => <details key={row.receiptId}><summary>{t('cashCustody.receipt')}: {row.receiptId} · {row.netWarehouseDueSyp == null ? '—' : formatSyp(row.netWarehouseDueSyp)}</summary>
        <p>{t('cashCustody.payment')}: {row.paymentId}</p>
        <table><thead><tr>{['invoice', 'contract', 'allocated', 'feniqSyp', 'repSyp', 'fx'].map(k => <th key={k}>{t(`cashCustody.${k}`)}</th>)}</tr></thead>
          <tbody>{row.allocations.map((a, i) => <tr key={`${a.invoiceId}:${i}`}><td>{a.orderId}<small>{a.chargeEntryId}</small></td>
            <td>{a.agreementReference} · {a.contractRevision}</td><td>{formatSyp(a.amountSyp)}</td>
            <td>{formatSyp(a.feniqSyp)}</td><td>{formatSyp(a.repSyp)}</td><td>{a.fx?.rate}</td></tr>)}</tbody></table>
      </details>)}
      <p>{t('cashCustody.commissionEvents')}: {account.commissionEventIds.join(', ') || '—'}</p>
      <p>{t('cashCustody.returnSources')}: {[...account.returnAdjustmentIds, ...account.creditIds, ...account.creditUseIds].join(', ') || '—'}</p>
    </section>)}
  </details>;
}
function CashCustodyContent({ accountId, scope, adminWarehouseId }) {
  const { t } = useTranslation();
  const store = useRef(cashPendingRequests(accountId, scope));
  const [data, setData] = useState(null), [error, setError] = useState(null), [pending, setPending] = useState({});
  const [storageReady, setStorageReady] = useState(false), [saving, setSaving] = useState(false), [notice, setNotice] = useState(null);
  const [reason, setReason] = useState(''), [reference, setReference] = useState(''), [time, setTime] = useState(''), [amount, setAmount] = useState('');
  const [pharmacyId, setPharmacyId] = useState(''), [receiptAmount, setReceiptAmount] = useState(''), [receiptTime, setReceiptTime] = useState(''), [receiptReference, setReceiptReference] = useState('');
  const [actorId, setActorId] = useState(''), [grantAction, setGrantAction] = useState('record_feniq');
  const [reversal, setReversal] = useState(null), [historical, setHistorical] = useState(null), [rejected, setRejected] = useState(null);
  const busy = useRef(false), generation = useRef(0), live = useRef(true);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setData(null); setError(null);
    try {
      const value = await api.cashCustody(adminWarehouseId);
      if (live.current && generation.current === version) setData(value);
    } catch (err) { if (live.current && generation.current === version) setError(err.message); }
  }, [adminWarehouseId]);
  useEffect(() => {
    const life = live, requests = generation;
    life.current = true;
    try { setPending(store.current.read()); setStorageReady(true); }
    catch { setStorageReady(false); }
    load();
    return () => { life.current = false; ++requests.current; };
  }, [load]);
  async function mutate(operation, resourceId = null, body = null) {
    if (busy.current || !storageReady) return;
    busy.current = true; setSaving(true); setError(null); setNotice(null); setRejected(null);
    try {
      const request = pending[operation] || { operation, resourceId, body: { ...body, idempotencyKey: newIdempotencyKey() } };
      store.current.save(request); // Fail before POST if exact retries cannot be persisted.
      setPending(old => ({ ...old, [operation]: request }));
      await api.cashOperation(adminWarehouseId, request.operation, request.resourceId, request.body);
      store.current.clear(operation);
      if (!live.current) return;
      setPending(old => { const next = { ...old }; delete next[operation]; return next; });
      setNotice(t('cashCustody.saved')); setReversal(null);
      await load();
    } catch (err) {
      if (live.current) {
        setError(err.message || t('cashCustody.storageFailed'));
        // Only explicit, pre-effect business rejections may release a saved
        // request. Timeouts, authorization loss and server errors stay pending.
        if (['CUSTODY_RECONCILIATION_CHANGED', 'REMITTANCE_PENDING', 'REMITTANCE_AMOUNT_MISMATCH', 'INVALID_REMITTANCE_REVERSAL'].includes(err.code)) setRejected(operation);
      }
    } finally { busy.current = false; if (live.current) setSaving(false); }
  }
  async function more(kind, cursor) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      const query = { [kind === 'movements' ? 'before' : kind === 'receipts' ? 'receiptBefore' : 'custodyBefore']: cursor };
      const next = await api.cashCustody(adminWarehouseId, query);
      if (!live.current) return;
      setData(old => ({ ...next, movements: kind === 'movements' ? [...old.movements, ...next.movements] : old.movements,
        receipts: kind === 'receipts' ? [...old.receipts, ...next.receipts] : old.receipts,
        custody: kind === 'custody' ? [...old.custody, ...next.custody] : old.custody,
        ...(kind !== 'movements' ? { hasMore: old.hasMore, nextBefore: old.nextBefore } : {}),
        ...(kind !== 'receipts' ? { receiptsTruncated: old.receiptsTruncated, nextReceiptBefore: old.nextReceiptBefore } : {}),
        ...(kind !== 'custody' ? { custodyTruncated: old.custodyTruncated, nextCustodyBefore: old.nextCustodyBefore } : {}),
      }));
    } catch (err) { if (live.current) { setData(null); setError(err.message); } }
    finally { busy.current = false; if (live.current) setSaving(false); }
  }
  const money = value => value == null ? '—' : formatSyp(value);
  const field = (value, update, type = 'text') => ({ type, value, disabled: saving, onChange: e => update(e.target.value) });
  const enabled = data?.writerEnabled && storageReady && !saving;
  const p = data?.permissions || {};
  return <section className="wh-detail-card" aria-label={t('cashCustody.title')}>
    <h2>{t('cashCustody.title')}</h2><p>{t('cashCustody.scope')}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={saving} onClick={load}>{t('common.retry')}</button>
    {Object.values(pending).map(request => <button key={request.operation} disabled={saving || !storageReady} onClick={() => mutate(request.operation)}>
      {t('cashCustody.retrySaved')}: {t(`cashCustody.operations.${request.operation}`)}</button>)}
    {rejected && <button disabled={saving} onClick={() => { store.current.clear(rejected); setPending(old => { const next = { ...old }; delete next[rejected]; return next; }); setRejected(null); }}>{t('cashCustody.releaseRejected')}</button>}
    {!data && !error && <p role="status">{t('common.loading')}</p>}
    {data && <>
      {!storageReady && <p role="alert">{t('cashCustody.storageFailed')}</p>}
      {!data.writerEnabled && <p>{t('cashCustody.writerOff')}</p>}
      <p>{t('accounting.updatedAt')}: {formatBusinessDateTime(data.asOf)}</p>
      <dl>{['grossCollectedSyp', 'cashInCustodySyp', 'feniqSyp', 'repSyp', 'cumulativeWarehouseDueSyp', 'remittedSyp', 'netWarehouseDueSyp'].map(k => <div key={k}><dt>{t(`cashCustody.${k}`)}</dt><dd>{money(data.summary[k])}</dd></div>)}</dl>
      {data.summary.blockers.map(b => <p role="alert" key={`${b.accountId}:${b.code}`}>{t(`cashCustody.blockers.${b.code}`, { defaultValue: b.code })}</p>)}
      <Trace result={data.summary} t={t} />
      {adminWarehouseId && p.record_remittance && <button disabled={!enabled || Boolean(pending.reconcile)} onClick={() => mutate('reconcile', null, {})}>{t('cashCustody.reconcile')}</button>}
      {adminWarehouseId && p.record_feniq && <form onSubmit={e => { e.preventDefault(); mutate('receipt', null, { pharmacyId, amountSyp: Number(receiptAmount), actualReceivedAt: new Date(receiptTime).toISOString(), reference: receiptReference }); }}>
        <fieldset disabled={!enabled || Boolean(pending.receipt)}><legend>{t('cashCustody.recordReceipt')}</legend>
          <label>{t('cashCustody.pharmacy')}<select required value={pharmacyId} onChange={e => setPharmacyId(e.target.value)}><option value="">—</option>{data.pharmacies.map(ph => <option key={ph._id} value={ph._id}>{displayName(ph.nameEn, ph.nameAr)}</option>)}</select></label>
          <label>{t('cashCustody.amount')}<input required min="1" step="1" {...field(receiptAmount, setReceiptAmount, 'number')} /></label>
          <label>{t('cashCustody.actualCashTime')}<input required {...field(receiptTime, setReceiptTime, 'datetime-local')} /></label>
          <label>{t('cashCustody.reference')}<input required maxLength={500} {...field(receiptReference, setReceiptReference)} /></label>
          <button>{t('cashCustody.recordReceipt')}</button>
        </fieldset>
      </form>}
      <label>{t('cashCustody.reason')}<input maxLength={500} {...field(reason, setReason)} /></label>
      <h3>{t('cashCustody.receipts')}</h3>
      <table><thead><tr>{['receipt', 'amount', 'actualCashTime', 'status', 'reference', 'decision'].map(k => <th key={k}>{t(`cashCustody.${k}`)}</th>)}</tr></thead><tbody>
        {data.receipts.map(r => <tr key={r.id}><td>{r.id}</td><td>{money(r.amountSyp)}</td><td>{formatBusinessDateTime(r.actualReceivedAt)}</td><td>{t(`cashCustody.statuses.${r.status}`)}</td><td>{r.reference}</td><td>
          {r.canReview && ['approved', 'rejected'].map(decision => <button key={decision} disabled={!enabled || Boolean(pending.receiptReview) || (decision === 'rejected' && !reason.trim())} onClick={() => mutate('receiptReview', r.id, { decision, reason: reason || null })}>{t(`cashCustody.statuses.${decision}`)}</button>)}
        </td></tr>)}
      </tbody></table>
      {data.receiptsTruncated && <button disabled={saving} onClick={() => more('receipts', data.nextReceiptBefore)}>{t('cashCustody.more')}</button>}
      <h3>{t('cashCustody.custody')}</h3><p>{t('cashCustody.deadlines')}</p>
      {data.custody.map(c => <p key={c._id}>{c.receiptId} · {money(c.netWarehouseDueSyp)} · {formatBusinessDateTime(c.actualReceivedAt)} → {formatBusinessDateTime(c.deadlineAt)} · {t(c.overdue ? 'cashCustody.overdue' : c.targetMissed ? 'cashCustody.targetMissed' : 'cashCustody.withinTarget')}</p>)}
      {data.custodyTruncated && <button disabled={saving} onClick={() => more('custody', data.nextCustodyBefore)}>{t('cashCustody.more')}</button>}
      {adminWarehouseId && (p.record_remittance || p.reverse_remittance) && <form onSubmit={e => { e.preventDefault(); mutate(reversal ? 'reversal' : 'transfer', reversal?._id || null, { amountSyp: Number(amount), transferredAt: new Date(time).toISOString(), reference,
        ...(reversal ? { reason } : { reconciliationId: data.reconciliation?._id }) }); }}>
        <fieldset disabled={!enabled || Boolean(pending[reversal ? 'reversal' : 'transfer'])}><legend>{t(reversal ? 'cashCustody.recordReversal' : 'cashCustody.recordTransfer')}</legend>
          {reversal && <p>{t('cashCustody.original')}: {reversal._id}</p>}
          <label>{t('cashCustody.amount')}<input required min="1" step="1" {...field(amount, setAmount, 'number')} /></label>
          <label>{t(reversal ? 'cashCustody.returnedAt' : 'cashCustody.transferredAt')}<input required {...field(time, setTime, 'datetime-local')} /></label>
          <label>{t('cashCustody.reference')}<input required maxLength={500} {...field(reference, setReference)} /></label>
          <button disabled={reversal ? !p.reverse_remittance || !reason.trim() : !p.record_remittance || !data.summary.ready || !data.reconciliationCurrent || data.summary.netWarehouseDueSyp <= 0}>{t(reversal ? 'cashCustody.recordReversal' : 'cashCustody.recordTransfer')}</button>
          {reversal && <button type="button" onClick={() => setReversal(null)}>{t('common.cancel')}</button>}
        </fieldset>
      </form>}
      <h3>{t('cashCustody.movements')}</h3><p>{t('cashCustody.independent')}</p>
      <table><thead><tr>{['reference', 'amount', 'transferredAt', 'status', 'decision'].map(k => <th key={k}>{t(`cashCustody.${k}`)}</th>)}</tr></thead><tbody>
        {data.movements.map(m => <tr key={m._id}><td>{m.reference}<small>{m._id} {m.originalId && `← ${m.originalId}`}</small>
          {m.reconciliationId && <button disabled={saving} onClick={async () => { try { setHistorical(null); setHistorical(await api.cashSnapshot(adminWarehouseId, m.reconciliationId)); } catch (err) { setError(err.message); } }}>{t('cashCustody.sources')}</button>}</td>
          <td>{money(m.amountSyp)} · {t(`cashCustody.operations.${m.kind === 'transfer' ? 'transfer' : 'reversal'}`)}</td><td>{formatBusinessDateTime(m.transferredAt)}</td><td>{t(`cashCustody.statuses.${m.status}`)}</td><td>
            {m.status === 'pending' && p.confirm_remittance && ['confirmed', 'rejected'].map(decision => <button key={decision} disabled={!enabled || !reason.trim() || Boolean(pending.review)} onClick={() => mutate('review', m._id, { decision, reason })}>{t(`cashCustody.statuses.${decision}`)}</button>)}
            {m.kind === 'transfer' && m.status === 'confirmed' && p.reverse_remittance && <button disabled={!enabled} onClick={() => { setReversal(m); setAmount(String(m.amountSyp)); }}>{t('cashCustody.recordReversal')}</button>}
          </td></tr>)}
      </tbody></table>
      {data.hasMore && <button disabled={saving} onClick={() => more('movements', data.nextBefore)}>{t('cashCustody.more')}</button>}
      {historical && <Trace result={historical.result} t={t} />}
      {adminWarehouseId && <details><summary>{t('cashCustody.grants')}</summary>
        <form onSubmit={e => { e.preventDefault(); mutate('grant', null, { actorId, action: grantAction, reason }); }}><fieldset disabled={saving || !storageReady || Boolean(pending.grant)}>
          <label>{t('cashCustody.actor')}<select required value={actorId} onChange={e => setActorId(e.target.value)}><option value="">—</option>{data.grantActors.map(a => <option key={a._id} value={a._id}>{a.name} · {a.warehouseRole || a.role}</option>)}</select></label>
          <label>{t('cashCustody.action')}<select value={grantAction} onChange={e => setGrantAction(e.target.value)}>{['record_feniq', 'approve_feniq', 'record_remittance', 'reverse_remittance', 'confirm_remittance'].map(a => <option key={a} value={a}>{t(`cashCustody.actions.${a}`)}</option>)}</select></label>
          <button disabled={!reason.trim()}>{t('cashCustody.grant')}</button>
        </fieldset></form>
        {data.actorGrants.map(g => <p key={g._id}>{data.grantActors.find(a => a._id === g.actorId)?.name || g.actorId} · {t(`cashCustody.actions.${g.action}`)} · {t(g.active ? 'cashCustody.active' : 'cashCustody.revoked')}
          {g.active && <button disabled={saving || !storageReady || !reason.trim() || Boolean(pending.revoke)} onClick={() => mutate('revoke', g._id, { reason })}>{t('cashCustody.revoke')}</button>}</p>)}
      </details>}
    </>}
  </section>;
}
