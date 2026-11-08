import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import './FeatureControlCenter.css';
import { Link } from 'react-router-dom';

export function FeatureControlCenter({ warehouseId, quickOnly = false }) {
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
  const [launch, setLaunch] = useState(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [pilot, setPilot] = useState(null);
  const [pilotDraft, setPilotDraft] = useState(null);
  const [pilotBusy, setPilotBusy] = useState(false);
  const [pilotError, setPilotError] = useState('');
  const [pilotSaved, setPilotSaved] = useState(false);
  useEffect(() => {
    if (warehouseId || quickOnly) return;
    let active = true;
    api.getPilotNotice().then(({ configuration }) => {
      if (!active) return;
      setPilot(configuration);
      setPilotDraft({
        enabled: configuration.enabled,
        textAr: configuration.textAr,
        textEn: configuration.textEn,
      });
      setPilotError('');
    }).catch(err => { if (active) setPilotError(err.message); });
    return () => { active = false; };
  }, [warehouseId, quickOnly, attempt]);
  async function savePilot(event) {
    event.preventDefault();
    if (!pilot || !pilotDraft || pilotBusy) return;
    setPilotBusy(true); setPilotError(''); setPilotSaved(false);
    try {
      const result = await api.savePilotNotice({ revision: pilot.revision, ...pilotDraft });
      setPilot(result.configuration);
      setPilotDraft({
        enabled: result.configuration.enabled,
        textAr: result.configuration.textAr,
        textEn: result.configuration.textEn,
      });
      setPilotSaved(true);
    } catch (err) { setPilotError(err.message); }
    finally { setPilotBusy(false); }
  }

  useEffect(() => {
    if (warehouseId) return;
    let active = true;
    api.getLaunchSettings().then(result => { if (active) setLaunch(result.configuration); })
      .catch(err => { if (active) setLaunchError(err.message); });
    return () => { active = false; };
  }, [warehouseId, attempt]);
  async function toggleOrdering() {
    if (!launch || launchBusy) return;
    setLaunchBusy(true); setLaunchError('');
    try {
      const opening = launch.mode !== 'ordering_open' || (launch.orderingClosesAt && Date.parse(launch.orderingClosesAt) <= Date.now());
      const result = await api.updateLaunchSettings({
        mode: opening ? 'ordering_open' : 'registration_only',
        message: opening ? 'استقبال الطلبات متاح الآن.' : 'التسجيل والتصفح متاحان. استقبال الطلبات متوقف حالياً.',
        revision: launch.revision,
        // No timed pilot: no per-pharmacy phone allowlist or demo-warehouse restriction.
        orderingClosesAt: null,
      });
      setLaunch(result.configuration);
    } catch (err) { setLaunchError(err.message); }
    finally { setLaunchBusy(false); }
  }
  const load = useCallback(async () => {
    const [platform, rights, bundles, audit] = await Promise.all([
      api.getFeatureControl(), warehouseId ? api.getWarehouseEntitlements(warehouseId) : Promise.resolve(null),
      api.getFeatureBundles(), api.getFeatureAudit(warehouseId),
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
    {warehouseId ? <h3>{t('featureControl.title')}</h3> : <h1>{t('featureControl.title')}</h1>}
    <p className="hint">{t('featureControl.help')}</p>
    {!warehouseId && <section className="adm-card reg-card" aria-label="التحكم باستقبال الطلبات">
      <h2>مفاتيح التشغيل العامة</h2>
      <p className="hint">تفعيل الطلبات يسمح لجميع الصيدليات المؤهلة بالطلب من المستودعات النشطة. الإيقاف يمنع إنشاء طلبات جديدة مع إبقاء التصفح متاحاً.</p>
      {launchError && <p role="alert" className="error-text">{launchError}</p>}
      {launch ? <button type="button" className={launch.mode === 'ordering_open' && (!launch.orderingClosesAt || Date.parse(launch.orderingClosesAt) > Date.now()) ? 'btn-primary' : 'btn-secondary'}
        disabled={launchBusy} onClick={toggleOrdering} aria-pressed={launch.mode === 'ordering_open' && (!launch.orderingClosesAt || Date.parse(launch.orderingClosesAt) > Date.now())}>
        استقبال الطلبات: {launch.mode === 'ordering_open' && (!launch.orderingClosesAt || Date.parse(launch.orderingClosesAt) > Date.now()) ? 'ON' : 'OFF'}
      </button> : <p role="status">جارٍ تحميل حالة استقبال الطلبات...</p>}
      <p className="hint">التقييمات وبقية الميزات الاختيارية موجودة ضمن مفاتيح التشغيل العامة أدناه. تبقى العمليات المالية خاضعة لضوابطها المستقلة.</p>
    </section>}
    {!warehouseId && !quickOnly && <section className="adm-card reg-card" aria-label="التنبيه التجريبي الدائم">
      <h2>التنبيه التجريبي داخل التطبيق</h2>
      <p className="hint">يظهر شريط صغير ثابت أعلى التطبيق في كل الصفحات، ويمكن تعديل نصه أو إيقافه من هنا. لا يغيّر استقبال الطلبات أو أي عمليات مالية.</p>
      {pilotError && <p role="alert" className="error-text">{pilotError}</p>}
      {pilotSaved && <p role="status">تم حفظ التنبيه. سيظهر التحديث على الأجهزة عند المزامنة التالية.</p>}
      {pilot && pilotDraft ? <form onSubmit={savePilot}>
        <fieldset disabled={pilotBusy}>
          <label className="feature-control-switch">
            <input type="checkbox" checked={pilotDraft.enabled}
              onChange={e => { setPilotDraft({ ...pilotDraft, enabled: e.target.checked }); setPilotSaved(false); }} />
            عرض التنبيه دائماً (ON / OFF)
          </label>
          <label>نص التنبيه بالعربية
            <textarea rows="3" maxLength="240" required value={pilotDraft.textAr}
              onChange={e => { setPilotDraft({ ...pilotDraft, textAr: e.target.value }); setPilotSaved(false); }} />
          </label>
          <label>نص التنبيه بالإنكليزية
            <textarea rows="3" maxLength="240" required value={pilotDraft.textEn}
              onChange={e => { setPilotDraft({ ...pilotDraft, textEn: e.target.value }); setPilotSaved(false); }} />
          </label>
          <button type="submit" className="btn-primary" disabled={pilotBusy || !pilotDraft.textAr.trim() || !pilotDraft.textEn.trim()}>
            حفظ التنبيه
          </button>
        </fieldset>
      </form> : <p role="status">جارٍ تحميل إعدادات التنبيه...</p>}
    </section>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => setAttempt(v => v + 1)}>{t('common.retry')}</button>
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">{t('common.loading')}</p>}
    {data && <>
      {!quickOnly && <p>{t('featureControl.core')}</p>}
      <label>{t('featureControl.reason')}<input value={reason} maxLength="1000" disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <form onSubmit={e => { e.preventDefault(); action(() => api.saveFeatureControl({ revision: data.platform.revision, features: switches, reason })); }}>
        <fieldset disabled={busy}>
          <legend>{t('featureControl.global')}</legend>
          {(data.platformFeatureNames || data.featureNames).map(key => <label key={key} className="feature-control-switch">
            <input type="checkbox" checked={(switches[key] ?? data.platformFeatureDefaults?.[key]) !== false} onChange={e => setSwitches({ ...switches, [key]: e.target.checked })} />
            <span>{label(key)}{data.featureDefinitions?.[key] && <small className="feature-state">{t(`featureControl.states.${data.featureDefinitions[key].status}`)}</small>}</span>
          </label>)}
          <button className="btn-primary" disabled={!reason.trim()}>{t('featureControl.saveGlobal')}</button>
        </fieldset>
      </form>
      {!quickOnly && <><p className="hint">{t('featureControl.implementationLimits')}</p>
      {!data.rights && <p><Link to="/admin/warehouse-access">{t('featureControl.chooseWarehouse')}</Link></p>}
      {data.rights && <><div className="feature-control-decisions" role="list">
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
            <option value="grant">{t('featureControl.administrativeGrant')}</option>
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
      </>}
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
        <ul>{data.events.map(event => <li key={event._id}><bdi>{new Date(event.createdAt).toLocaleString()}</bdi> ·
          {t(`featureControl.actions.${event.action}`, { defaultValue: event.action })} · {event.reason} ·
          {event.actorId?.name || t('featureControl.previousAccount')} · {event.warehouseId?.nameAr || event.warehouseId?.nameEn || t('featureControl.platformScope')}</li>)}</ul>
      </details></>}
    </>}
  </section>;
}
