import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// Pre-launch "clean page": cancels every UNDELIVERED order created before the
// chosen moment. Delivered orders already carry real debts and are only
// reported. Nothing loads or writes until the admin asks for a preview, and the
// write repeats the previewed count so a stale screen can never act.
// The cutoff is always Damascus time (UTC+03:00 all year), whatever the
// admin's device clock zone, so "00:00 on 1 December" means the same moment
// for everyone.
const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000;
function damascusNow() {
  return new Date(Date.now() + DAMASCUS_OFFSET_MS).toISOString().slice(0, 16);
}
function damascusIso(value) {
  return new Date(`${value}:00+03:00`).toISOString();
}
function damascusLabel(iso) {
  return new Date(iso).toLocaleString('ar-SY', { timeZone: 'Asia/Damascus', dateStyle: 'medium', timeStyle: 'short' });
}

export function TrialOrderResetCard() {
  const { t } = useTranslation();
  const [before, setBefore] = useState(damascusNow);
  const [includeRoad, setIncludeRoad] = useState(false);
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState(() => t('maintenance.trialReset.defaultReason'));
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function loadPreview() {
    setBusy(true); setError(''); setResult(null); setSure(false);
    try {
      setPreview((await api.previewTrialOrderReset(damascusIso(before), includeRoad)).preview);
    } catch (err) {
      setPreview(null); setError(err.message);
    } finally { setBusy(false); }
  }

  async function execute() {
    if (!preview || !window.confirm(t('maintenance.trialReset.confirm', { count: preview.resettableCount }))) return;
    setBusy(true); setError('');
    try {
      const response = await api.executeTrialOrderReset({
        before: preview.before, reason: reason.trim(), confirmCount: preview.resettableCount,
        includeOutForDelivery: preview.includeOutForDelivery,
      });
      setResult(response.result);
      setPreview(response.result.after);
      setSure(false);
    } catch (err) {
      setError(err.code === 'TRIAL_RESET_CHANGED' ? t('maintenance.trialReset.changed') : err.message);
    } finally { setBusy(false); }
  }

  const reasonOk = reason.trim().length >= 10 && reason.trim().length <= 300;
  const canExecute = preview && preview.resettableCount > 0 && !preview.tooMany && reasonOk && sure && !busy;

  return <section className="adm-card" aria-labelledby="trial-reset-title">
    <div className="adm-card-head" id="trial-reset-title">{t('maintenance.trialReset.title')}</div>
    <div className="adm-maintenance-body">
      <p className="hint">{t('maintenance.trialReset.intro')}</p>
      <label>{t('maintenance.trialReset.before')}
        <input type="datetime-local" value={before} max={damascusNow()}
          onChange={(event) => { setBefore(event.target.value); setPreview(null); }} />
        <span className="hint"> {t('maintenance.trialReset.damascusTime')}</span>
      </label>
      <label>
        <input type="checkbox" checked={includeRoad}
          onChange={(event) => { setIncludeRoad(event.target.checked); setPreview(null); }} />
        {t('maintenance.trialReset.includeRoad')}
      </label>
      <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={busy || !before}>
        {busy ? t('common.loading') : t('maintenance.trialReset.preview')}
      </button>
      {error && <p role="alert" className="error-text">{error}</p>}
      {preview && <div className="adm-maintenance-readiness" data-testid="trial-reset-preview">
        <p className="hint">{t('maintenance.trialReset.cutoffShown', { at: damascusLabel(preview.before) })}</p>
        {preview.onTheRoad.orders > 0 && <div className="adm-maintenance-warning" role="status" data-testid="trial-reset-road">
          <p>{t(preview.includeOutForDelivery ? 'maintenance.trialReset.roadIncluded' : 'maintenance.trialReset.roadExcluded',
            { count: preview.onTheRoad.orders })}</p>
          <ul>{preview.onTheRoad.list.map(row => <li key={row.id}>
            #{row.orderNumber} · {row.nameAr || row.nameEn || row.id} · {Number(row.finalPriceSyp || 0).toLocaleString()} {t('maintenance.trialReset.syp')}
            {row.sentAt && <> · {damascusLabel(row.sentAt)}</>}
          </li>)}</ul>
        </div>}
        <dl className="adm-maintenance-stats">
          <div><dt>{t('maintenance.trialReset.resettable')}</dt><dd>{preview.resettableCount}</dd></div>
          <div><dt>{t('maintenance.trialReset.pharmacies')}</dt><dd>{preview.affectedPharmacies}</dd></div>
          {preview.resettableStatuses.map(status => <div key={status}>
            <dt>{t('maintenance.trialReset.statuses.' + status)}</dt><dd>{preview.statusCounts[status] || 0}</dd>
          </div>)}
        </dl>
        {preview.warehouses.length > 0 && <ul>
          {preview.warehouses.map(row => <li key={row.id}>{row.nameAr || row.nameEn || row.id}: {row.orders}</li>)}
        </ul>}
        {preview.deliveredUntouched.orders > 0 && <p className="adm-maintenance-warning" role="status">
          {t('maintenance.trialReset.deliveredWarning', { count: preview.deliveredUntouched.orders })}
        </p>}
        {preview.tooMany && <p className="error-text" role="alert">{t('maintenance.trialReset.tooMany', { max: preview.maxOrdersPerRun })}</p>}
        {preview.resettableCount === 0
          ? <p role="status">{t('maintenance.trialReset.nothing')}</p>
          : <>
            <label>{t('maintenance.trialReset.reason')}
              <textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            {!reasonOk && <p className="hint">{t('maintenance.trialReset.reasonHint')}</p>}
            <label>
              <input type="checkbox" checked={sure} onChange={(event) => setSure(event.target.checked)} />
              {t('maintenance.trialReset.sure', { count: preview.resettableCount })}
            </label>
            <button type="button" className="btn btn-reject" onClick={execute} disabled={!canExecute}>
              {t('maintenance.trialReset.execute', { count: preview.resettableCount })}
            </button>
          </>}
      </div>}
      {result && <p role="status" className="adm-maintenance-warning" data-testid="trial-reset-result">
        {t('maintenance.trialReset.done', { cancelled: result.cancelled, skipped: result.skipped,
          failed: result.failed.length, notified: result.notifiedPharmacies, warehouses: result.notifiedWarehouses })}
      </p>}
    </div>
  </section>;
}
