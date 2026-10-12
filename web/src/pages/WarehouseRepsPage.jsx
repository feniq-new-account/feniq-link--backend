import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import {
  MAX_REP_COMMISSION_RATE,
  commissionSplit,
  formatPercent,
  lastSeenKey,
  normalizePhoneInput,
  parseCommissionInput,
  repFormError,
  toLocalPhone,
} from '../utils/reps';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';

const EMPTY_FORM = { name: '', phone: '', password: '', commissionRate: '', shareToRep: false };

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

  const formRate = parseCommissionInput(form.commissionRate);
  const commissionPreview = formRate ? commissionSplit(formRate, form.shareToRep) : null;

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
        commissionRate: parseCommissionInput(form.commissionRate),
        warehouseShareToRep: form.shareToRep,
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

  const editCommission = async (rep) => {
    const answer = window.prompt(
      t('reps.editCommissionPrompt', { name: rep.name, max: MAX_REP_COMMISSION_RATE }),
      String(rep.commissionRate ?? 0)
    );
    if (answer === null) return;
    const rate = parseCommissionInput(answer);
    setNotice(null);
    if (rate === null) {
      setError(t('reps.errors.commission', { max: MAX_REP_COMMISSION_RATE }));
      return;
    }
    setError(null);
    try {
      await api.updateWarehouseRep(rep.id, { commissionRate: rate });
      setNotice(t('reps.commissionUpdated', { name: rep.name, rate: formatPercent(rate) }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // The warehouse's own quarter of the commission: kept, or given to this rep.
  const toggleShareToRep = async (rep) => {
    const next = !rep.warehouseShareToRep;
    setError(null);
    setNotice(null);
    try {
      await api.updateWarehouseRep(rep.id, { warehouseShareToRep: next });
      setNotice(t(next ? 'reps.shareToRepUpdatedOn' : 'reps.shareToRepUpdatedOff', { name: rep.name }));
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
        <button
          type="button"
          className="btn-primary"
          style={{ width: 'auto', marginTop: 0 }}
          onClick={() => setIsFormOpen((open) => !open)}
        >
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
            <label>
              {t('reps.commissionRate')}
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                value={form.commissionRate}
                onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
              />
            </label>
            <p className="hint">{t('reps.commissionHint')}</p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.shareToRep}
                onChange={(e) => setForm({ ...form, shareToRep: e.target.checked })}
              />
              {t('reps.shareToRep')}
            </label>
            <p className="hint">{t('reps.shareToRepHint')}</p>
            {commissionPreview && (
              <p className="hint">
                {t('reps.commissionSplit', {
                  feniq: formatPercent(commissionPreview.feniq),
                  pharmacy: formatPercent(commissionPreview.pharmacy),
                  rep: formatPercent(commissionPreview.rep),
                  saving: formatPercent(commissionPreview.saving),
                })}
              </p>
            )}
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
        <>
          {/* One card per rep instead of a wide table: the actions used to sit
              in the table's last column, off-screen behind a sideways scroll,
              so warehouse owners never found them. Here every action is a
              labelled button in plain sight under the rep's numbers. */}
          <div className="wh-rep-grid">
            {reps.map((rep) => (
              <article key={rep.id} className={`wh-rep-card${rep.isActive ? '' : ' is-inactive'}`}>
                <header className="wh-rep-card-head">
                  <div>
                    <Link className="wh-rep-card-name" to={`/warehouse/reps/${rep.id}`}>{rep.name}</Link>
                    <div className="wh-table-sub wh-num" dir="ltr">{toLocalPhone(rep.phone)}</div>
                  </div>
                  <span className={`wh-rep-status${rep.isActive ? ' is-active' : ''}`}>
                    {rep.isActive ? t('reps.active') : t('reps.inactive')}
                  </span>
                </header>

                <dl className="wh-rep-stats">
                  <div>
                    <dt>{t('reps.pharmacies')}</dt>
                    <dd className="wh-num">{rep.pharmacyCount}</dd>
                  </div>
                  <div>
                    <dt>{t('reps.visits30d')}</dt>
                    <dd className="wh-num">{rep.visits30d}</dd>
                    {rep.unverifiedVisits30d > 0 && (
                      <div className="wh-table-sub">{t('reps.unverified', { count: rep.unverifiedVisits30d })}</div>
                    )}
                  </div>
                  <div>
                    <dt>{t('reps.monthOrders')}</dt>
                    <dd className="wh-num">{rep.monthOrdersCount}</dd>
                    <div className="wh-table-sub wh-num">{formatSyp(rep.monthOrdersTotal)}</div>
                  </div>
                  <div>
                    <dt>{t('reps.lastVisit')}</dt>
                    <dd className="wh-rep-stat-text">{lastSeen(rep.lastVisitAt)}</dd>
                  </div>
                </dl>

                <div className="wh-rep-commission">
                  <div className="wh-rep-commission-head">
                    <span>{t('reps.monthCommission')}</span>
                    <strong className="wh-num">
                      {rep.commissionRate > 0 ? formatPercent(rep.commissionRate) : t('reps.commissionNone')}
                    </strong>
                  </div>
                  {rep.commissionRate > 0 && (
                    <div className="wh-rep-commission-split wh-num">
                      <span>{t('reps.commissionRep', { amount: formatSyp(rep.monthCommission?.repAmount ?? 0) })}</span>
                      <span>{t('reps.commissionFeniq', { amount: formatSyp(rep.monthCommission?.feniqAmount ?? 0) })}</span>
                      <span>{t('reps.commissionPharmacy', { amount: formatSyp(rep.monthCommission?.pharmacyAmount ?? 0) })}</span>
                      <span>{t('reps.commissionSaving', { amount: formatSyp(rep.monthCommission?.savingAmount ?? 0) })}</span>
                    </div>
                  )}
                  <div className="wh-rep-commission-actions">
                    <button type="button" className="wh-rep-btn" onClick={() => editCommission(rep)}>
                      {t('reps.editCommission')}
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rep.warehouseShareToRep}
                      className={`wh-rep-switch${rep.warehouseShareToRep ? ' is-on' : ''}`}
                      onClick={() => toggleShareToRep(rep)}
                    >
                      <span className="wh-rep-switch-track" aria-hidden="true"><span /></span>
                      {t('reps.toggleShareToRep')}: {t(rep.warehouseShareToRep ? 'reps.shareToRepOn' : 'reps.shareToRepOff')}
                    </button>
                  </div>
                </div>

                <footer className="wh-rep-actions">
                  <Link className="wh-rep-btn wh-rep-btn-primary" to={`/warehouse/reps/${rep.id}`}>
                    {t('reps.open')}
                  </Link>
                  <button type="button" className="wh-rep-btn" onClick={() => resetPassword(rep)}>
                    {t('reps.resetPassword')}
                  </button>
                  <button
                    type="button"
                    className={`wh-rep-btn${rep.isActive ? ' wh-rep-btn-danger' : ' wh-rep-btn-ok'}`}
                    onClick={() => toggleActive(rep)}
                  >
                    {rep.isActive ? t('reps.deactivate') : t('reps.activate')}
                  </button>
                </footer>
              </article>
            ))}
          </div>
          <p className="hint">{t('reps.commissionCountsDelivered')}</p>
        </>
      )}
    </div>
  );
}
