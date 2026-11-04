import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import './FeatureControlCenter.css';
import { hasRolePermission } from '../utils/userPermissions';
import { useWarehouseSubscription } from '../context/WarehouseSubscriptionContext';

export function FeaturePreferencesCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { refresh, applyFeatures } = useWarehouseSubscription();
  const [data, setData] = useState(null);
  const [features, setFeatures] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!hasRolePermission(user, 'featureConfigure')) return null;
  async function load() {
    setBusy(true); setError(null); setSaved(false);
    try { const result = await api.getMyEntitlements(); setData(result); setFeatures(result.configuration.features); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try { const result = await api.saveMyFeatureConfiguration({ revision: data.revision, features, reason });
      setData({ ...data, revision: result.revision, features: result.features });
      applyFeatures(result.features); refresh(); setSaved(true); setReason(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="feature-control-center">
    <h2>{t('featureControl.preferences')}</h2>
    <p className="hint">{t('featureControl.preferencesHelp')}</p>
    <button type="button" className="btn-secondary" onClick={load} disabled={busy}>{t(data ? 'common.retry' : 'featureControl.showPreferences')}</button>
    {error && <p role="alert" className="error-text">{error}</p>}
    {saved && <p role="status">{t('featureControl.preferencesSaved')}</p>}
    {data && <form onSubmit={save}><fieldset disabled={busy}>
      {data.selfConfigurable.map(key => <label key={key} className="feature-control-switch">
        <input type="checkbox" checked={features[key] !== false} onChange={e => setFeatures({ ...features, [key]: e.target.checked })} />
        {t(`warehouseAccess.features.${key}`)} · {t(data.features[key] ? 'featureControl.allowed' : 'featureControl.denied')}
      </label>)}
      <label>{t('featureControl.reason')}<input required maxLength="1000" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="btn-primary">{t('common.save')}</button>
    </fieldset></form>}
  </section>;
}
