import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { lastSeenKey, repFormError, toLocalPhone, normalizePhoneInput } from '../utils/reps';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';

const EMPTY_FORM = { name: '', phone: '', password: '' };

// The warehouse's field reps: who they are, how many pharmacies each covers,
// how often they visited them, and this month's orders placed under them.
// A rep's pharmacies and visit log are on WarehouseRepDetailPage.
export function WarehouseRepsPage() {
  const { t } = useTranslation();
  const [reps, setReps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.warehouseReps();
      setReps(data.reps);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A visit changes the counts on this page.
  useRealtimeSync([REALTIME_EVENTS.REP_VISIT_CREATED], () => load());

  const lastSeen = (value) => {
    const { key, count } = lastSeenKey(value);
    return t(key, { count });
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const problem = repFormError(form);
    if (problem) {
      setFormError(t(problem.key, problem.values));
      return;
    }
    setIsSaving(true);
    try {
      const { rep } = await api.createWarehouseRep({
        name: form.name.trim(),
        phone: normalizePhoneInput(form.phone),
        password: form.password,
      });
      setNotice(t('reps.created', { name: rep.name, phone: toLocalPhone(rep.phone) }));
      setForm(EMPTY_FORM);
      setIsFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (rep) => {
    if (rep.isActive && !window.confirm(t('reps.confirmDeactivate', { name: rep.name }))) return;
    setError(null);
    try {
      await api.updateWarehouseRep(rep.id, { isActive: !rep.isActive });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (rep) => {
    const password = window.prompt(t('reps.resetPasswordPrompt', { name: rep.name }));
    if (!password) return;
    const problem = repFormError({ name: rep.name, phone: toLocalPhone(rep.phone), password });
    if (problem) {
      setError(t(problem.key, problem.values));
      return;
    }
    setError(null);
    try {
      await api.resetWarehouseRepPassword(rep.id, password);
      setNotice(t('reps.passwordReset', { name: rep.name }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('reps.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setIsFormOpen((open) => !open)}>
          {t('reps.addRep')}
        </button>
      </div>
      <p className="hint">{t('reps.intro')}</p>

      {notice && <p className="wh-settings-success">{notice}</p>}
      {error && <p className="error-text">{error}</p>}

      {isFormOpen && (
        <div className="wh-detail-card">
          <h2 className="wh-detail-card-title">{t('reps.addRep')}</h2>
          <form onSubmit={handleCreate} className="product-form">
            <label>
              {t('reps.name')}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              {t('reps.phone')}
              <input
                type="tel"
                dir="ltr"
                placeholder="09xxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
            </label>
            <label>
              {t('reps.tempPassword')}
              <input
                type="text"
                dir="ltr"
                autoComplete="off"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <p className="hint">{t('reps.tempPasswordHint')}</p>
            {formError && <p className="error-text">{formError}</p>}
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? t('reps.creating') : t('reps.create')}
            </button>
          </form>
        </div>
      )}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : reps.length === 0 ? (
        <div className="wh-empty-state">
          <div className="wh-empty-state-title">{t('reps.noReps')}</div>
        </div>
      ) : (
        <div className="wh-card" style={{ overflowX: 'auto' }}>
          <table className="wh-table">
            <thead>
              <tr>
                <th>{t('reps.name')}</th>
                <th>{t('reps.pharmacies')}</th>
                <th>{t('reps.visits30d')}</th>
                <th>{t('reps.lastVisit')}</th>
                <th>{t('reps.monthOrders')}</th>
                <th>{t('reps.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => (
                <tr key={rep.id}>
                  <td>
                    <Link to={`/warehouse/reps/${rep.id}`}>{rep.name}</Link>
                    <div className="wh-table-sub wh-num" dir="ltr">{toLocalPhone(rep.phone)}</div>
                  </td>
                  <td className="wh-num">{rep.pharmacyCount}</td>
                  <td>
                    <span className="wh-num">{rep.visits30d}</span>
                    {rep.unverifiedVisits30d > 0 && (
                      <div className="wh-table-sub">{t('reps.unverified', { count: rep.unverifiedVisits30d })}</div>
                    )}
                  </td>
                  <td>{lastSeen(rep.lastVisitAt)}</td>
                  <td>
                    <span className="wh-num">{rep.monthOrdersCount}</span>
                    <div className="wh-table-sub wh-num">{formatSyp(rep.monthOrdersTotal)}</div>
                  </td>
                  <td>{rep.isActive ? t('reps.active') : t('reps.inactive')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="btn-secondary" to={`/warehouse/reps/${rep.id}`}>
                      {t('reps.open')}
                    </Link>{' '}
                    <button type="button" className="btn-secondary" onClick={() => resetPassword(rep)}>
                      {t('reps.resetPassword')}
                    </button>{' '}
                    <button type="button" className="btn-secondary" onClick={() => toggleActive(rep)}>
                      {rep.isActive ? t('reps.deactivate') : t('reps.activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
