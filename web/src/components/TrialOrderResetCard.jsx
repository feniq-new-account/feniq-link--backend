import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// Pre-launch "clean page": cancels every UNDELIVERED order created before the
// chosen moment. Delivered orders already carry real debts and are only
// reported. Nothing loads or writes until the admin asks for a preview, and the
// write repeats the previewed count so a stale screen can never act.
function localNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function TrialOrderResetCard() {
  const { t } = useTranslation();
  const [before, setBefore] = useState(localNow);
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState(() => t('maintenance.trialReset.defaultReason'));
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function loadPreview() {
    setBusy(true); setError(''); setResult(null); setSure(false);
    try {
      setPreview((await api.previewTrialOrderReset(new Date(before).toISOString())).preview);
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
        <input type="datetime-local" value={before} max={localNow()}
          onChange={(event) => { setBefore(event.target.value); setPreview(null); }} />
      </label>
      <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={busy || !before}>
        {busy ? t('common.loading') : t('maintenance.trialReset.preview')}
      </button>
      {error && <p role="alert" className="error-text">{error}</p>}
      {preview && <div className="adm-maintenance-readiness" data-testid="trial-reset-preview">
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
          failed: result.failed.length, notified: result.notifiedPharmacies })}
      </p>}
    </div>
  </section>;
}
