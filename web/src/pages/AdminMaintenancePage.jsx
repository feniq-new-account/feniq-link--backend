import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import './AdminMaintenancePage.css';

const inventoryFields = ['products', 'offers', 'advertisements', 'banners', 'orders', 'orderitems',
  'returns', 'payments', 'ledgerentries', 'creditentries', 'pharmacycredits', 'complaints'];

function DisplayCount({ value }) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString();
}

export function AdminMaintenancePage() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setPreview((await api.getAdminMaintenancePreview()).preview); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <main className="adm-maintenance">
    <h1>{t('maintenance.title')}</h1>
    <p className="hint">{t('maintenance.intro')}</p>
    <section className="adm-card">
      <div className="adm-card-head">{t('maintenance.inventoryTitle')}</div>
      <div className="adm-maintenance-body">
        <button type="button" className="btn btn-primary" onClick={refresh} disabled={busy}>
          {busy ? t('common.loading') : t('maintenance.refresh')}
        </button>
        {error && <p role="alert" className="error-text">{error}</p>}
        {!preview && !error && <p className="hint">{t('common.loading')}</p>}
        {preview && <>
          <p className="hint">{t('maintenance.generated')}: {new Date(preview.generatedAt).toLocaleString()}</p>
          {preview.needsAccountRecovery > 0 && <p role="status" className="adm-maintenance-warning">
            {t('maintenance.accountsBlocked', { count: preview.needsAccountRecovery })}{' '}
            <Link to="/admin/accounts">{t('maintenance.manageAccounts')}</Link>
          </p>}
          <p className="adm-maintenance-warning">
            {t('maintenance.cleanupBlocked')}
          </p>
          {preview.warehouses.length === 0
            ? <p>{t('maintenance.noWarehouses')}</p>
            : <div className="adm-maintenance-warehouses">
              {preview.warehouses.map(warehouse => <section className="adm-maintenance-warehouse" key={warehouse.id}>
                <h2>{warehouse.nameAr}</h2>
                <p className="hint">{warehouse.city} · {t('maintenance.accountStatus')}: {warehouse.accountStatus}</p>
                <dl className="adm-maintenance-stats">
                  {inventoryFields.map(field => <div key={field}>
                    <dt>{t('maintenance.fields.' + field)}</dt>
                    <dd><DisplayCount value={warehouse.counts[field]} /></dd>
                  </div>)}
                </dl>
              </section>)}
            </div>}
        </>}
      </div>
    </section>
    <section className="adm-card">
      <div className="adm-card-head">{t('maintenance.backupTitle')}</div>
      <div className="adm-maintenance-body">
        <p>{t('maintenance.restoreWarning')}</p>
        <div className="adm-maintenance-links">
          <a className="btn btn-secondary" href="https://github.com/feniq-new-account/feniq-link--backend/actions/workflows/db-backup.yml" target="_blank" rel="noreferrer">
            {t('maintenance.openBackup')}
          </a>
          <a className="btn btn-secondary" href="https://github.com/feniq-new-account/feniq-link--backend/blob/main/backend/scripts/backup/README.md" target="_blank" rel="noreferrer">
            {t('maintenance.restoreGuide')}
          </a>
          <Link className="btn btn-secondary" to="/admin/registration">{t('maintenance.orderControls')}</Link>
        </div>
        <p className="hint">{t('maintenance.notYetAutomated')}</p>
      </div>
    </section>
  </main>;
}
