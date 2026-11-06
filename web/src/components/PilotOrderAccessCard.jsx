import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// These are test accounts only. Financial and order processing remain owned
// by the existing services; this form only controls entry to timed ordering.
export function PilotOrderAccessCard() {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(null);
  const [phones, setPhones] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function load() {
    setError(''); setSaved(false);
    try {
      const { configuration } = await api.getPilotOrderAccess();
      setRevision(configuration.revision);
      setPhones((configuration.allowedPhones || []).join('\n'));
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault();
    if (revision === null) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      const allowedPhones = [...new Set(phones.split(/[\n,;\s]+/g).map(v => v.trim()).filter(Boolean))];
      const response = await api.updatePilotOrderAccess({ revision, allowedPhones });
      setRevision(response.configuration.revision);
      setPhones((response.configuration.allowedPhones || []).join('\n'));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="adm-card reg-card">
    <div className="adm-card-head">{t('pilotAccess.title')}</div>
    <div className="reg-card-body">
      <p className="hint">{t('pilotAccess.description')}</p>
      <p className="hint">{t('pilotAccess.safety')}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {revision === null ? <button className="btn btn-secondary" type="button" onClick={load}>{t('pilotAccess.retry')}</button>
        : <form className="launch-settings-form" onSubmit={save}>
          <label>{t('pilotAccess.phonesLabel')}
            <textarea rows={4} dir="ltr" value={phones} disabled={busy}
              placeholder="0944000000" onChange={event => { setPhones(event.target.value); setSaved(false); }} />
          </label>
          <p className="hint">{t('pilotAccess.phonesHelp')}</p>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t('common.loading') : t('pilotAccess.save')}
          </button>
          {saved && <p role="status">{t('pilotAccess.saved')}</p>}
        </form>}
    </div>
  </section>;
}
