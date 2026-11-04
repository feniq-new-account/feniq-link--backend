import { NumericInput } from '../components/NumericInput';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const ROLES = ['pharmacy', 'rep', 'warehouse'];
function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formFor(configuration, origin) {
  return {
    enabled: configuration?.enabled ?? false, revision: configuration?.revision ?? 0,
    sourceOrigin: configuration ? new URL(configuration.apkUrl).origin : origin,
    versionName: configuration?.versionName || '1.0.0', notes: configuration?.notes || '',
    roles: Object.fromEntries(ROLES.map((role) => [role, {
      recommendedBuild: configuration?.roles?.[role]?.recommendedBuild ?? 0,
      minimumBuild: configuration?.roles?.[role]?.minimumBuild ?? 1,
      mandatoryAfter: localDate(configuration?.roles?.[role]?.mandatoryAfter),
    }])),
  };
}

export function AdminAppReleasePage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.getAdminAppRelease();
      setForm(formFor(result.configuration, result.defaultOrigin)); setArtifact(result.configuration);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const inspect = async () => {
    setBusy(true); setError(null); setNotice(null); setArtifact(null);
    try {
      const result = await api.inspectAdminAppRelease(form.sourceOrigin);
      setArtifact(result.artifact);
      setForm((current) => ({ ...current, roles: Object.fromEntries(ROLES.map((role) => [role, {
        ...current.roles[role], recommendedBuild: current.roles[role].recommendedBuild || result.artifact.latestBuild,
      }])) }));
      setNotice(t('appRelease.verified'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const updateRole = (role, fields) => setForm((current) => ({ ...current,
    roles: { ...current.roles, [role]: { ...current.roles[role], ...fields } },
  }));
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.updateAdminAppRelease({ ...form,
        roles: Object.fromEntries(ROLES.map((role) => [role, {
          minimumBuild: Number(form.roles[role].minimumBuild), recommendedBuild: Number(form.roles[role].recommendedBuild),
          mandatoryAfter: form.roles[role].mandatoryAfter ? new Date(form.roles[role].mandatoryAfter).toISOString() : null,
        }])),
      });
      setForm(formFor(result.configuration, form.sourceOrigin)); setArtifact(result.configuration);
      setNotice(t('appRelease.saved'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (loading) return <p role="status">{t('common.loading')}</p>;
  return <section className="app-release-page">
    <h1>{t('appRelease.title')}</h1>
    <p className="hint">{t('appRelease.help')}</p>
    {error && <div role="alert"><p className="error-text">{error}</p>
      <button type="button" className="btn-secondary" onClick={load} disabled={busy}>{t('appRelease.reload')}</button></div>}
    {notice && <p role="status">{notice}</p>}
    {form && <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend>{t('appRelease.publication')}</legend>
        <label className="warehouse-access-feature"><input type="checkbox" checked={form.enabled}
          onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />{t('appRelease.enabled')}</label>
        <label>{t('appRelease.origin')}<input type="url" dir="ltr" value={form.sourceOrigin}
          onChange={(event) => { setForm({ ...form, sourceOrigin: event.target.value }); setArtifact(null); }} /></label>
        <button type="button" className="btn-secondary" onClick={inspect}>{t('appRelease.inspect')}</button>
        {artifact && <p>{t('appRelease.availableBuild')}: <bdi dir="ltr">{artifact.latestBuild}</bdi> —
          {' '}{(artifact.size / 1048576).toFixed(1)} MB</p>}
        <label>{t('appRelease.version')}<input value={form.versionName} dir="ltr" required={form.enabled}
          pattern="[0-9]+\.[0-9]+\.[0-9]+" onChange={(event) => setForm({ ...form, versionName: event.target.value })} /></label>
        <label>{t('appRelease.notes')}<textarea maxLength="2000" value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <div className="app-release-roles">
          {ROLES.map((role) => <fieldset key={role} disabled={!form.enabled || busy}>
            <legend>{t(`appRelease.roles.${role}`)}</legend>
            <label>{t('appRelease.recommended')}<NumericInput type="number" lang="en" dir="ltr" min="1"
              max={artifact?.latestBuild || undefined} required value={form.roles[role].recommendedBuild || ''}
              onChange={(event) => updateRole(role, { recommendedBuild: event.target.value })} /></label>
            <label>{t('appRelease.minimum')}<NumericInput type="number" lang="en" dir="ltr" min="1"
              max={artifact?.latestBuild || undefined} required value={form.roles[role].minimumBuild}
              onChange={(event) => updateRole(role, { minimumBuild: event.target.value })} /></label>
            <label>{t('appRelease.deadline')}<input type="datetime-local" lang="en" dir="ltr"
              value={form.roles[role].mandatoryAfter} onChange={(event) => updateRole(role, { mandatoryAfter: event.target.value })} /></label>
            <p className="hint">{t('appRelease.deadlineHelp')}</p>
            <button type="button" className="btn-secondary" disabled={!artifact} onClick={() => updateRole(role, {
              minimumBuild: artifact.latestBuild, recommendedBuild: artifact.latestBuild,
              mandatoryAfter: localDate(new Date(Date.now() + 7 * 86400000)),
            })}>{t('appRelease.sevenDays')}</button>
          </fieldset>)}
        </div>
        <button type="submit" className="btn-primary" disabled={form.enabled && !artifact}>
          {busy ? t('common.loading') : t('appRelease.save')}
        </button>
      </fieldset>
    </form>}
  </section>;
}
