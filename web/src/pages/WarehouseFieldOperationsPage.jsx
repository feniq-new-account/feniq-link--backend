import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';

// READ-ONLY operations for one authenticated warehouse. The existing
// warehouse/reps API enforces warehouse scoping and returns 30-day visit counts.
// No payment, settlement, commission or order state is changed or displayed.
export function WarehouseFieldOperationsPage() {
  const { i18n } = useTranslation();
  const ar = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar');
  const tr = (a, e) => ar ? a : e;
  const [reps, setReps] = useState([]);
  const [query, setQuery] = useState('');
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await api.warehouseReps();
      setReps(response.reps || []);
      setError('');
      setRefreshedAt(new Date());
    } catch (err) {
      setError(err?.message || 'Unable to load rep activity');
      setReps([]); // Never present stale numbers as current.
      setRefreshedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useRealtimeSync([REALTIME_EVENTS.REP_VISIT_CREATED], load);

  const totals = useMemo(() => reps.reduce((summary, rep) => ({
    active: summary.active + (rep.isActive ? 1 : 0),
    assigned: summary.assigned + (rep.isActive ? (rep.pharmacyCount || 0) : 0),
    verified: summary.verified + (rep.visits30d || 0),
    unverified: summary.unverified + (rep.unverifiedVisits30d || 0),
  }), { active: 0, assigned: 0, verified: 0, unverified: 0 }), [reps]);

  const visible = useMemo(() => reps.filter(rep =>
    (!onlyNeedsAttention || (rep.isActive && (rep.unverifiedVisits30d > 0 ||
      rep.lastVisitAt == null))) &&
    (!query.trim() || rep.name?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  ).sort((a, b) => (b.unverifiedVisits30d || 0) - (a.unverifiedVisits30d || 0) ||
    (a.lastVisitAt || '').localeCompare(b.lastVisitAt || '')), [reps, onlyNeedsAttention, query]);

  return (
    <section className="wh-page">
      <div className="wh-page-head">
        <h1>{tr('متابعة الميدان', 'Field operations')}</h1>
        <button type="button" className="btn-secondary" onClick={() => { setLoading(true); void load(); }}>
          {tr('تحديث البيانات', 'Refresh')}
        </button>
      </div>
      <p className="hint">{tr(
        'مراقبة نشاط مناديب مستودعك خلال آخر 30 يوماً. أرقام الزيارات فقط، دون عمليات مالية.',
        'Operational visit activity for your warehouse over the last 30 days. No financial actions.',
      )}</p>
      {loading && <p>{tr('جارٍ تحميل النشاط...', 'Loading activity...')}</p>}
      {error && <p className="error-text" role="alert">{tr(
        'تعذّر تحديث نشاط المندوبين. المعلومات السابقة غير معروضة.',
        'Could not refresh rep activity; previous values are hidden.',
      )}{' '}{error}</p>}
      {!error && !loading && <>
        <div className="insights-kpis">
          {[
            [tr('مناديب نشطون', 'Active reps'), totals.active],
            [tr('صيدليات مسندة للمناديب النشطين', 'Active reps assigned pharmacies'), totals.assigned],
            [tr('زيارات موثقة خلال 30 يوم', 'Verified visits (30 days)'), totals.verified],
            [tr('زيارات غير موثقة خلال 30 يوم', 'Unverified visits (30 days)'), totals.unverified],
          ].map(([label, value]) => (
            <div className="wh-detail-card" key={label}><span>{label}</span>
              <strong className="wh-num">{value}</strong></div>
          ))}
        </div>
        <div className="wh-detail-card">
          <div className="wh-page-head"><h2>{tr('قائمة المتابعة', 'Follow-up queue')}</h2>
            <Link to="/warehouse/reps">{tr('إدارة المندوبين', 'Manage reps')}</Link>
          </div>
          <label>{tr('البحث عن مندوب', 'Search reps')}
            <input aria-label="Search field reps" type="search" value={query}
              onChange={event => setQuery(event.target.value)} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={onlyNeedsAttention}
              onChange={event => setOnlyNeedsAttention(event.target.checked)} />
            {tr('إظهار من يحتاج متابعة فقط', 'Show reps needing follow-up')}
          </label>
          {visible.length === 0
            ? <p className="hint">{tr('لا يوجد مندوبون مطابقون.', 'No matching reps.')}</p>
            : <div className="table-scroll"><table className="wh-table">
              <thead><tr>
                <th>{tr('المندوب', 'Rep')}</th>
                <th>{tr('الحالة', 'Status')}</th>
                <th>{tr('صيدليات مسندة', 'Assigned pharmacies')}</th>
                <th>{tr('زيارات موثقة', 'Verified visits')}</th>
                <th>{tr('زيارات غير موثقة', 'Unverified')}</th>
                <th>{tr('آخر زيارة', 'Last visit')}</th>
              </tr></thead>
              <tbody>{visible.map(rep => (
                <tr key={rep.id}>
                  <td><Link to={`/warehouse/reps/${encodeURIComponent(rep.id)}`}>{rep.name}</Link></td>
                  <td>{rep.isActive ? tr('نشط', 'Active') : tr('غير نشط', 'Inactive')}</td>
                  <td className="wh-num">{rep.pharmacyCount || 0}</td>
                  <td className="wh-num">{rep.visits30d || 0}</td>
                  <td className="wh-num">{rep.unverifiedVisits30d || 0}</td>
                  <td dir="ltr">{rep.lastVisitAt
                    ? new Date(rep.lastVisitAt).toLocaleDateString(ar ? 'ar-SY' : 'en-GB')
                    : tr('لم تسجل زيارة', 'No visits recorded')}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </div>
        {refreshedAt && <p className="hint">{tr('آخر تحديث: ', 'Refreshed: ')}
          <time dateTime={refreshedAt.toISOString()}>
            {refreshedAt.toLocaleString(ar ? 'ar-SY' : 'en-GB')}
          </time>
        </p>}
      </>}
    </section>
  );
}
