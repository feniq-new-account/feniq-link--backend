import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import './FeatureControlCenter.css';

export function FeatureControlCenter({ warehouseId }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [switches, setSwitches] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [grant, setGrant] = useState({ kind: 'addon', sourceCode: '', feature: 'ownerMobileAccess', startsAt: '', endsAt: '', decisionRef: '' });
  const [bundle, setBundle] = useState({ code: '', name: '', tier: 'custom', features: [], decisionRef: '' });
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(async () => {
    const [platform, rights, bundles, audit] = await Promise.all([
      api.getFeatureControl(), api.getWarehouseEntitlements(warehouseId), api.getFeatureBundles(), api.getFeatureAudit(),
    ]);
    return { ...platform, rights, bundles: bundles.bundles, events: audit.events };
  }, [warehouseId]);
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    load().then(result => { if (live) { setData(result); setSwitches(result.platform.features); } })
      .catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [load, attempt]);
  async function action(work) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await work();
      const result = await load(); setData(result); setSwitches(result.platform.features);
      setReason(''); setNotice(t('featureControl.saved'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const label = key => t(`warehouseAccess.features.${key}`, { defaultValue: key });
  return <section className="feature-control-center">
    <h3>{t('featureControl.title')}</h3>
    <p className="hint">{t('featureControl.help')}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => setAttempt(v => v + 1)}>{t('common.retry')}</button>
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">{t('common.loading')}</p>}
    {data && <>
      <p>{t('featureControl.core')}</p>
      <label>{t('featureControl.reason')}<input value={reason} maxLength="1000" disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <form onSubmit={e => { e.preventDefault(); action(() => api.saveFeatureControl({ revision: data.platform.revision, features: switches, reason })); }}>
        <fieldset disabled={busy}>
          <legend>{t('featureControl.global')}</legend>
          {data.featureNames.map(key => <label key={key} className="feature-control-switch">
            <input type="checkbox" checked={switches[key] !== false} onChange={e => setSwitches({ ...switches, [key]: e.target.checked })} />{label(key)}
          </label>)}
          <button className="btn-primary" disabled={!reason.trim()}>{t('featureControl.saveGlobal')}</button>
        </fieldset>
      </form>
      <div className="feature-control-decisions" role="list">
        {data.featureNames.map(key => <p key={key} role="listitem"><strong>{label(key)}</strong>: {t(data.rights.features[key] ? 'featureControl.allowed' : 'featureControl.denied')}
          {' · '}{t(`featureControl.reasons.${data.rights.decisions[key].reason}`, { defaultValue: data.rights.decisions[key].reason })}</p>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); action(() => api.grantWarehouseFeatures(warehouseId, {
        revision: data.rights.revision, reason, kind: grant.kind,
        ...(grant.kind === 'bundle' ? { sourceCode: grant.sourceCode } : { features: [grant.feature] }),
        startsAt: new Date(grant.startsAt).toISOString(), endsAt: new Date(grant.endsAt).toISOString(), decisionRef: grant.decisionRef,
      })); }}>
        <fieldset disabled={busy}>
          <legend>{t('featureControl.grant')}</legend>
          <label>{t('featureControl.kind')}<select value={grant.kind} onChange={e => setGrant({ ...grant, kind: e.target.value })}>
            <option value="addon">{t('featureControl.addon')}</option><option value="bundle">{t('featureControl.bundle')}</option>
          </select></label>
          {grant.kind === 'bundle' ? <label>{t('featureControl.bundle')}<select required value={grant.sourceCode} onChange={e => setGrant({ ...grant, sourceCode: e.target.value })}>
            <option value="">{t('featureControl.choose')}</option>{data.bundles.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select></label> : <label>{t('featureControl.feature')}<select value={grant.feature} onChange={e => setGrant({ ...grant, feature: e.target.value })}>
            {data.featureNames.map(key => <option key={key} value={key}>{label(key)}</option>)}
          </select></label>}
          <label>{t('featureControl.startsAt')}<input type="datetime-local" required value={grant.startsAt} onChange={e => setGrant({ ...grant, startsAt: e.target.value })} /></label>
          <label>{t('featureControl.endsAt')}<input type="datetime-local" required value={grant.endsAt} onChange={e => setGrant({ ...grant, endsAt: e.target.value })} /></label>
          <label>{t('featureControl.decisionRef')}<input required maxLength="500" value={grant.decisionRef} onChange={e => setGrant({ ...grant, decisionRef: e.target.value })} /></label>
          <button className="btn-primary" disabled={!reason.trim()}>{t('featureControl.grant')}</button>
        </fieldset>
      </form>
      <ul>{(data.rights.configuration?.grants || []).map(g => <li key={g._id}>
        {g.sourceCode || g.features.map(label).join('، ')} · <bdi>{new Date(g.endsAt).toLocaleDateString()}</bdi>
        {g.revokedAt ? <span> · {t('featureControl.revoked')}</span> : <button type="button" className="btn-secondary" disabled={busy || !reason.trim()}
          onClick={() => action(() => api.revokeWarehouseGrant(warehouseId, g._id, { revision: data.rights.revision, reason }))}>{t('featureControl.revoke')}</button>}
      </li>)}</ul>
      <details><summary>{t('featureControl.defineBundle')}</summary>
        <p className="hint">{t('featureControl.bundleHelp')}</p>
        <form onSubmit={e => { e.preventDefault(); action(() => api.createFeatureBundle({ ...bundle, reason })); }}>
          <fieldset disabled={busy}>
            <label>{t('featureControl.code')}<input required pattern="[a-z][a-z0-9_-]{0,79}" value={bundle.code} onChange={e => setBundle({ ...bundle, code: e.target.value })} /></label>
            <label>{t('featureControl.name')}<input required maxLength="120" value={bundle.name} onChange={e => setBundle({ ...bundle, name: e.target.value })} /></label>
            <label>{t('featureControl.tier')}<select value={bundle.tier} onChange={e => setBundle({ ...bundle, tier: e.target.value })}>
              <option value="custom">{t('featureControl.customTier')}</option><option value="advanced">{t('featureControl.advancedTier')}</option>
            </select></label>
            {bundle.tier === 'advanced' && <p className="hint">{t('featureControl.ownerIncluded')}</p>}
            <label>{t('featureControl.decisionRef')}<input required maxLength="500" value={bundle.decisionRef} onChange={e => setBundle({ ...bundle, decisionRef: e.target.value })} /></label>
            {data.featureNames.map(key => <label key={key} className="feature-control-switch"><input type="checkbox" checked={bundle.features.includes(key)}
              onChange={e => setBundle({ ...bundle, features: e.target.checked ? [...bundle.features, key] : bundle.features.filter(f => f !== key) })} />{label(key)}</label>)}
            <button className="btn-primary" disabled={!reason.trim() || !bundle.features.length}>{t('featureControl.defineBundle')}</button>
          </fieldset>
        </form>
      </details>
      <details><summary>{t('featureControl.audit')}</summary>
        <ul>{data.events.map(event => <li key={event._id}><bdi>{new Date(event.createdAt).toLocaleString()}</bdi> · {event.action} · {event.reason}</li>)}</ul>
      </details>
    </>}
  </section>;
}
