import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { generateTemporaryPassword } from '../utils/passwordPolicy';
import './AdminMaintenancePage.css';

const legacyPhones = new Set(['0930000101', '0930000102', '0930000103']);

const inventoryFields = ['products', 'offers', 'advertisements', 'banners', 'orders', 'orderitems',
  'returns', 'payments', 'ledgerentries', 'creditentries', 'pharmacycredits', 'complaints'];

function DisplayCount({ value }) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString();
}

export function AdminMaintenancePage() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [recoveryError, setRecoveryError] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setPreview((await api.getAdminMaintenancePreview()).preview); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Reuses the authenticated, audited admin recovery endpoints. No passwords
  // are hard-coded, transmitted in URL parameters or persisted in browser storage.
  // Only known legacy seed identities can be targeted.
  async function recoverAccounts() {
    setRecovering(true); setRecoveryError('');
    try {
      const page = await api.adminAccounts({ role: 'warehouse', status: 'blocked', limit: 100 });
      const matches = (page.accounts || []).filter(account =>
        account.user?.role === 'warehouse' && account.user?.status === 'blocked' &&
        legacyPhones.has(account.user?.phone));
      if (matches.length === 0) {
        setRecoveryError(t('maintenance.noBlockedAccounts'));
        return;
      }
      if (!window.confirm(t('maintenance.recoverConfirm', { count: matches.length }))) return;
      for (const account of matches) {
        const password = generateTemporaryPassword('warehouse');
        // When a reset succeeds but unblocking fails, the password must still
        // be handed to the admin, not lost in a catch block or page refresh.
        await api.resetAccountPassword(account.user.id, {
          password, reason: 'Owner-authorized November 2026 warehouse pilot recovery',
        });
        const result = { phone: account.user.phone, password, status: 'reset' };
        setCredentials(previous => [...previous, result]);
        try {
          await api.unblockAccount(account.user.id);
          result.status = 'active';
          setCredentials(previous => previous.map(item => item.phone === result.phone ? { ...result } : item));
        } catch (error) {
          setRecoveryError(t('maintenance.unblockFailed', { phone: account.user.phone }) + ': ' + error.message);
          return;
        }
      }
      await refresh();
    } catch (error) {
      setRecoveryError(error.message);
    } finally {
      setRecovering(false);
    }
  }
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
          {preview.pilotReadiness && <section className="adm-maintenance-readiness" aria-label={t('maintenance.pilotReadiness')}>
            <h2>{t('maintenance.pilotReadiness')}</h2>
            <p className="hint">{t('maintenance.readinessNotEndToEnd')}</p>
            <dl className="adm-maintenance-stats">
              {['activePharmacies', 'visibleWarehouses', 'warehousesWithCatalog', 'warehousesWithOffers', 'warehousesWithPackages'].map(field =>
                <div key={field}>
                  <dt>{t('maintenance.readinessFields.' + field)}</dt>
                  <dd><DisplayCount value={preview.pilotReadiness[field]} /></dd>
                </div>)}
            </dl>
            <p className="adm-maintenance-warning" role="status">
              {preview.pilotReadiness.orderingEnabled
                ? t('maintenance.orderSwitchOn') : t('maintenance.orderSwitchOff')}
            </p>
          </section>}
          {preview.needsAccountRecovery > 0 && <div className="adm-maintenance-warning">
            <p role="status">{t('maintenance.accountsBlocked', { count: preview.needsAccountRecovery })}</p>
            <p className="hint">{t('maintenance.recoveryHint')}</p>
            <button type="button" className="btn btn-primary" disabled={recovering}
              onClick={recoverAccounts}>{recovering ? t('common.loading') : t('maintenance.recoverAccounts')}</button>
            {' '}<Link to="/admin/accounts">{t('maintenance.manageAccounts')}</Link>
          </div>}
          {recoveryError && <p className="error-text" role="alert">{recoveryError}</p>}
          {credentials.length > 0 && <section className="adm-maintenance-secrets">
            <h2>{t('maintenance.newCredentials')}</h2>
            <p>{t('maintenance.credentialsWarning')}</p>
            {credentials.map(item => <div className="adm-maintenance-secret-row" key={item.phone}>
              <span dir="ltr">{item.phone}</span>
              <code dir="ltr">{item.password}</code>
              <strong>{item.status === 'active' ? t('maintenance.activated') : t('maintenance.resetOnly')}</strong>
            </div>)}
            <button type="button" className="btn btn-secondary" onClick={() => setCredentials([])}>
              {t('maintenance.clearCredentials')}
            </button>
          </section>}
          <p className="adm-maintenance-warning">
            {t('maintenance.cleanupBlocked')}
          </p>
          {preview.warehouses.length === 0
            ? <p>{t('maintenance.noWarehouses')}</p>
            : <div className="adm-maintenance-warehouses">
              {preview.warehouses.map(warehouse => <section className="adm-maintenance-warehouse" key={warehouse.id}>
                <h2>{warehouse.nameAr}</h2>
                <p className="hint">{warehouse.city} · {t('maintenance.accountStatus')}: {warehouse.accountStatus}</p>
                {warehouse.readiness && <>
                  <p className="adm-maintenance-warning">
                    {warehouse.readiness.visibleToPharmacist
                      ? t('maintenance.warehouseVisible') : t('maintenance.warehouseHidden')}
                  </p>
                  <dl className="adm-maintenance-stats">
                    {['availableProducts', 'visibleOffers', 'visiblePackages', 'visibleBanners'].map(field =>
                      <div key={field}>
                        <dt>{t('maintenance.readinessFields.' + field)}</dt>
                        <dd><DisplayCount value={warehouse.readiness[field]} /></dd>
                      </div>)}
                  </dl>
                </>}
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
