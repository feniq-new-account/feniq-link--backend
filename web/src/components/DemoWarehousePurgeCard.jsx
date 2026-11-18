import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// Before the first real warehouse: deletes the three demo warehouses
// (0930000101..103) and everything that belongs to them. Pharmacy accounts are
// never touched - the server refuses to, and the preview says how many stay.
// Nothing loads until the admin asks; the delete echoes the previewed plan, so
// a stale screen can never act, and needs the phrase typed by hand.
export function DemoWarehousePurgeCard() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function loadPreview() {
    setBusy(true); setError(''); setResult(null); setPhrase(''); setBackedUp(false);
    try { setPreview((await api.previewDemoWarehousePurge()).preview); }
    catch (err) { setPreview(null); setError(err.message); }
    finally { setBusy(false); }
  }

  async function execute() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const response = await api.executeDemoWarehousePurge({ planToken: preview.planToken, confirm: phrase });
      setResult(response.result);
      setPreview(null);
    } catch (err) {
      setError(err.code === 'DEMO_PURGE_PLAN_CHANGED' ? t('maintenance.demoPurge.changed') : err.message);
    } finally { setBusy(false); }
  }

  const nothing = preview && preview.warehouses.length === 0;
  const canExecute = preview && !nothing && phrase === preview.confirmPhrase && backedUp && !busy;

  return <section className="adm-card" aria-labelledby="demo-purge-title">
    <div className="adm-card-head" id="demo-purge-title">{t('maintenance.demoPurge.title')}</div>
    <div className="adm-maintenance-body">
      <p className="hint">{t('maintenance.demoPurge.intro')}</p>
      <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={busy}>
        {busy ? t('common.loading') : t('maintenance.demoPurge.preview')}
      </button>
      {error && <p role="alert" className="error-text">{error}</p>}
      {preview && <div className="adm-maintenance-readiness" data-testid="demo-purge-preview">
        {nothing ? <p role="status">{t('maintenance.demoPurge.nothing')}</p> : <>
          <p><strong>{t('maintenance.demoPurge.warehouses')}</strong></p>
          <ul>{preview.warehouses.map(w => <li key={w.id}>{w.nameAr || w.nameEn} · {w.city}</li>)}</ul>
          <p><strong>{t('maintenance.demoPurge.logins')}</strong></p>
          <ul>{preview.logins.map(u => <li key={u.id}><bdi dir="ltr">{u.phone}</bdi> · {u.name} · {u.role}</li>)}</ul>
          <dl className="adm-maintenance-stats">
            {Object.entries(preview.counts).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
          </dl>
          <p className="adm-maintenance-warning" role="status" data-testid="demo-purge-kept">
            {t('maintenance.demoPurge.pharmaciesKept', { count: preview.pharmacyAccountsKept })}
          </p>
          <label>
            <input type="checkbox" checked={backedUp} onChange={(event) => setBackedUp(event.target.checked)} />
            {t('maintenance.demoPurge.backedUp')}
          </label>
          <label>{t('maintenance.demoPurge.typePhrase', { phrase: preview.confirmPhrase })}
            <input type="text" value={phrase} onChange={(event) => setPhrase(event.target.value)} dir="rtl" />
          </label>
          <button type="button" className="btn btn-reject" onClick={execute} disabled={!canExecute}>
            {t('maintenance.demoPurge.execute', { count: preview.warehouses.length })}
          </button>
        </>}
      </div>}
      {result && <p role="status" className="adm-maintenance-warning" data-testid="demo-purge-result">
        {t('maintenance.demoPurge.done', { warehouses: result.warehouses.length, logins: result.logins.length,
          pharmacies: result.pharmacyAccountsKept })}
      </p>}
    </div>
  </section>;
}
