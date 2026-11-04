import './LaunchSettingsCard.css';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export function LaunchSettingsCard() {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setError('');
    try { setConfiguration((await api.getLaunchSettings()).configuration); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { mode, message, revision } = configuration;
      setConfiguration((await api.updateLaunchSettings({ mode, message, revision })).configuration);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="adm-card reg-card">
    <div className="adm-card-head">{t('launch.title')}</div>
    <div className="reg-card-body">
      {error && <p className="error-text" role="alert">{error} <button type="button" onClick={load} disabled={busy}>{t('launch.reload')}</button></p>}
      {!configuration ? <p>{t('common.loading')}</p> : <form className="launch-settings-form" onSubmit={save}>
        <p className="hint">{t('launch.hint')}</p>
        <label>{t('launch.mode')}<select value={configuration.mode} disabled={busy}
          onChange={event => setConfiguration({ ...configuration, mode: event.target.value })}>
          <option value="registration_only">{t('launch.registrationOnly')}</option>
          <option value="ordering_open">{t('launch.orderingOpen')}</option>
        </select></label>
        <label>{t('launch.message')}<textarea required maxLength={500} value={configuration.message} disabled={busy}
          onChange={event => setConfiguration({ ...configuration, message: event.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy || !configuration.message.trim()}>{t('launch.save')}</button>
        <p className="hint">{t('launch.revision', { revision: configuration.revision })}</p>
      </form>}
    </div>
  </section>;
}
