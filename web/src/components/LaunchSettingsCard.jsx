import './LaunchSettingsCard.css';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// datetime-local is deliberately expressed in the operator's device time.
// The API stores canonical UTC instants, which the server checks on each order.
function localDateTimeValue(utc) {
  if (!utc) return '';
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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
      const { mode, message, revision, orderingClosesAt = null } = configuration;
      setConfiguration((await api.updateLaunchSettings({ mode, message, revision, orderingClosesAt })).configuration);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const hasDeadline = Boolean(configuration?.orderingClosesAt);
  const missingDeadline = configuration?.mode === 'ordering_open' && !hasDeadline;
  const expired = configuration?.mode === 'ordering_open' && hasDeadline &&
    Number.isFinite(Date.parse(configuration.orderingClosesAt)) &&
    Date.parse(configuration.orderingClosesAt) <= Date.now();
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
        <label className="launch-deadline-toggle">
          <input type="checkbox" checked={hasDeadline} disabled={busy}
            onChange={event => setConfiguration({ ...configuration,
              orderingClosesAt: event.target.checked ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null })} />
          {t('launch.autoCloseEnabled')}
        </label>
        {hasDeadline && <label>{t('launch.closesAt')}
          <input type="datetime-local" value={localDateTimeValue(configuration.orderingClosesAt)}
            required disabled={busy}
            onChange={event => setConfiguration({ ...configuration,
              orderingClosesAt: event.target.value ? new Date(event.target.value).toISOString() : null })} />
        </label>}
        <p className="hint">{t('launch.closesAtHint')}</p>
        {expired && <p className="hint" role="status">{t('launch.pilotExpired')}</p>}
        {missingDeadline && <p className="hint" role="note">{t('launch.deadlineWarning')}</p>}
        <label>{t('launch.message')}<textarea required maxLength={500} value={configuration.message} disabled={busy}
          onChange={event => setConfiguration({ ...configuration, message: event.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy || !configuration.message.trim()}>{t('launch.save')}</button>
        <p className="hint">{t('launch.revision', { revision: configuration.revision })}</p>
      </form>}
    </div>
  </section>;
}
