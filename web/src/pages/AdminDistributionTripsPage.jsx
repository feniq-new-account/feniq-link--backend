import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { TripLiveLocationPanel } from './TripLiveLocationPanel';

const initial = { region: '', serviceDate: '', driverName: '', driverPhone: '', driverUserId: '' };

export function AdminDistributionTripsPage() {
  const { i18n } = useTranslation();
  const ar = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar');
  const tr = (a, e) => ar ? a : e;
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignment, setAssignment] = useState({});
  const [form, setForm] = useState(initial);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await api.adminDistributionTrips();
      setTrips(data.trips || []);
    } catch (e) {
      setError(e.message || 'Cannot load trips.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let alive = true;
    api.adminDistributionDrivers().then(result => {
      if (alive) setDrivers(result.drivers || []);
    }).catch(() => {
      if (alive) setError(tr('تعذر تحميل قائمة المندوبين.', 'Could not load driver accounts.'));
    });
    return () => { alive = false; };
  }, []);

  async function lookup(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api.adminAccounts({ role: 'pharmacy', status: 'active', search, limit: 20 });
      setCandidates((data.accounts || []).filter(a => a.pharmacy?.id));
    } catch (e) {
      setError(e.message || 'Cannot find pharmacies.');
    }
  }

  function add(account) {
    const pharmacy = account.pharmacy;
    const stop = { id: pharmacy.id, name: pharmacy.nameAr || pharmacy.nameEn || account.user.name,
      address: pharmacy.address || '' };
    setSelected(old => old.some(x => x.id === stop.id) ? old : [...old, stop]);
  }

  async function submit(event) {
    event.preventDefault();
    if (selected.length === 0) {
      setError(tr('اختر صيدلية واحدة على الأقل.', 'Choose at least one pharmacy.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createDistributionTrip({ ...form, pharmacyIds: selected.map(x => x.id) });
      setForm(initial);
      setSelected([]);
      setCandidates([]);
      setNotice(tr('تم إنشاء رحلة التوزيع.', 'Distribution trip created.'));
      await refresh();
    } catch (e) {
      setError(e.message || 'Unable to create trip.');
    } finally {
      setBusy(false);
    }
  }

  async function action(trip, command, extra = {}) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const methods = {
        start: () => api.startDistributionTrip(trip._id, trip.revision),
        complete: () => api.completeDistributionTrip(trip._id, trip.revision),
        cancel: () => api.cancelDistributionTrip(trip._id, trip.revision, extra.reason),
        stop: () => api.updateDistributionStop(trip._id, extra.stopId,
          { revision: trip.revision, status: extra.status, note: extra.note || '' }),
      };
      await methods[command]();
      await refresh();
    } catch (e) {
      setError(e.message || 'Unable to update trip; refresh the list.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver(trip) {
    const driverUserId = assignment[trip._id];
    if (!driverUserId) return;
    setBusy(true);
    setError('');
    try {
      await api.assignDistributionTripDriver(trip._id, trip.revision, driverUserId);
      await refresh();
      setNotice(tr('تم ربط الرحلة بحساب المندوب.', 'Trip assigned to driver account.'));
    } catch (e) {
      setError(e.message || 'Could not assign driver.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const mark = (trip, stop, status) => {
    const note = status === 'failed'
      ? window.prompt(tr('سبب فشل التسليم:', 'Reason for failed delivery:'))
      : '';
    if (note === null || (status === 'failed' && !note.trim())) return;
    void action(trip, 'stop', { stopId: stop._id, status, note });
  };

  return (
    <div className="reg-page">
      <div className="adm-page-head">
        <h1>{tr('رحلات التوزيع', 'Distribution trips')}</h1>
        <button type="button" className="btn-secondary" onClick={refresh} disabled={busy}>
          {tr('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="hint">{tr(
        'تخطيط وتتبع إداري للرحلات فقط. لا يسجل دفعات أو فواتير أو مبالغ.',
        'Operational trip planning only. No payments, invoices or amounts are recorded.',
      )}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="reg-success" role="status">{notice}</p>}
      <section className="adm-card reg-card">
        <div className="adm-card-head"><span>{tr('إنشاء رحلة', 'Create trip')}</span></div>
        <div className="reg-card-body">
          <form onSubmit={lookup}>
            <label>{tr('ابحث عن صيدلية موجودة', 'Find existing pharmacy')}</label>
            <input aria-label="Search pharmacy" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tr('الاسم أو الرقم', 'Name or phone')} />
            <button type="submit" className="btn-secondary">{tr('بحث', 'Search')}</button>
          </form>
          {candidates.map(a => (
            <div key={a.pharmacy.id}>
              <button type="button" disabled={busy} className="btn-secondary"
                onClick={() => add(a)}>
                {tr('إضافة', 'Add')} — {a.pharmacy.nameAr || a.pharmacy.nameEn}
              </button>
            </div>
          ))}
          <p className="hint">{tr('التوقفات حسب الترتيب المختار:', 'Stops in chosen order:')}</p>
          <ol>{selected.map((s, i) => <li key={s.id}>
            {s.name} — {s.address}{' '}
            <button type="button" onClick={() => setSelected(old => old.filter(x => x.id !== s.id))}
              aria-label={'Remove stop ' + (i + 1)}>{tr('إزالة', 'Remove')}</button>
          </li>)}</ol>
          <form onSubmit={submit}>
            <label>{tr('منطقة الرحلة', 'Region')}
              <input required maxLength={160} value={form.region}
                onChange={e => setForm(old => ({ ...old, region: e.target.value }))} />
            </label>
            <label>{tr('تاريخ الرحلة', 'Service date')}
              <input type="date" required value={form.serviceDate}
                onChange={e => setForm(old => ({ ...old, serviceDate: e.target.value }))} />
            </label>
            <label>{tr('اسم السائق', 'Driver name')}
              <input required maxLength={160} value={form.driverName}
                onChange={e => setForm(old => ({ ...old, driverName: e.target.value }))} />
            </label>
            <label>{tr('هاتف السائق (اختياري)', 'Driver phone (optional)')}
              <input type="tel" value={form.driverPhone}
                onChange={e => setForm(old => ({ ...old, driverPhone: e.target.value }))} />
            </label>
            <label>{tr('حساب السائق (اختياري)', 'Driver login (optional)')}
              <select aria-label="Driver login" value={form.driverUserId}
                onChange={e => {
                  const driver = drivers.find(d => d.userId === e.target.value);
                  setForm(old => ({
                    ...old,
                    driverUserId: e.target.value,
                    ...(driver ? { driverName: driver.name, driverPhone: driver.phone } : {}),
                  }));
                }}>
                <option value="">{tr('بدون ربط بحساب', 'No account assigned')}</option>
                {drivers.map(d => <option key={d.userId} value={d.userId}>
                  {d.name} — {d.phone}
                </option>)}
              </select>
            </label>
            <button type="submit" disabled={busy} className="btn-primary">
              {tr('إنشاء الرحلة', 'Create trip')}
            </button>
          </form>
        </div>
      </section>
      <section className="adm-card reg-card">
        <div className="adm-card-head"><span>{tr('الرحلات الأخيرة', 'Recent trips')}</span></div>
        <div className="reg-card-body">
          {trips.map(trip => (
            <article key={trip._id} className="adm-card" style={{ padding: 16, marginBottom: 12 }}>
              <strong>{trip.region}</strong>{' — '}{trip.driverName}
              {' — '}{String(trip.serviceDate).slice(0, 10)}
              <p>{tr('الحالة', 'Status')}: {trip.status}</p>
              <TripLiveLocationPanel trip={trip} arabic={ar} onRouteSaved={refresh} />
              {trip.stops.map(stop => (
                <div key={stop._id}>
                  {stop.pharmacyName} — {stop.status}
                  {trip.status === 'in_progress' && stop.status === 'pending' && (
                    <>
                      {' '}<button type="button" disabled={busy}
                        onClick={() => mark(trip, stop, 'delivered')}>
                        {tr('تم التسليم', 'Delivered')}
                      </button>
                      {' '}<button type="button" disabled={busy}
                        onClick={() => mark(trip, stop, 'failed')}>
                        {tr('فشل التسليم', 'Failed')}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {trip.status === 'planned' && (
                <div>
                  <label>{tr('ربط بحساب مندوب', 'Assign driver account')}
                    <select aria-label={'Assign driver ' + trip._id}
                      value={assignment[trip._id] || trip.driverUserId || ''}
                      onChange={e => setAssignment(old => ({ ...old, [trip._id]: e.target.value }))}>
                      <option value="">{tr('اختر حساباً', 'Choose driver')}</option>
                      {drivers.map(d => <option key={d.userId} value={d.userId}>
                        {d.name} — {d.phone}
                      </option>)}
                    </select>
                  </label>
                  <button type="button" className="btn-secondary"
                    disabled={busy || !(assignment[trip._id] || trip.driverUserId)}
                    onClick={() => assignDriver(trip)}>
                    {tr('حفظ تعيين السائق', 'Save driver assignment')}
                  </button>
                </div>
              )}
              {trip.status === 'planned' && (
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => action(trip, 'start')}>{tr('بدء الرحلة', 'Start trip')}</button>
              )}
              {trip.status === 'in_progress' && trip.stops.every(x => x.status !== 'pending') && (
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => action(trip, 'complete')}>{tr('إغلاق الرحلة', 'Complete trip')}</button>
              )}
              {['planned', 'in_progress'].includes(trip.status) && (
                <button type="button" className="btn-secondary" disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(tr('سبب إلغاء الرحلة:', 'Reason for cancellation:'));
                    if (reason?.trim()) void action(trip, 'cancel', { reason: reason.trim() });
                  }}>{tr('إلغاء الرحلة', 'Cancel trip')}</button>
              )}
            </article>
          ))}
          {trips.length === 0 && <p className="hint">{tr('لا توجد رحلات.', 'No trips yet.')}</p>}
        </div>
      </section>
    </div>
  );
}
