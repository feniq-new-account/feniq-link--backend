import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const STATES = {
  live: ['موقع حديث', 'Fresh GPS'],
  stale: ['الموقع متوقف', 'GPS stale'],
  no_signal: ['بلا إشارة', 'No GPS fix'],
  unavailable: ['تعذر فحص الموقع', 'GPS unavailable'],
};

export function AdminOperationsOverview() {
  const { i18n } = useTranslation();
  const arabic = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar');
  const tr = (ar, en) => arabic ? ar : en;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await api.adminDistributionOverview();
      setData(response.overview);
      setError('');
    } catch (err) {
      // Never keep a prior GPS state looking live after polling has failed.
      setData(null);
      setError(err?.message || tr('فشل تحديث عمليات التوزيع', 'Could not refresh distribution operations'));
    } finally {
      setLoading(false);
    }
  }, [arabic]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const response = await api.adminDistributionOverview();
        if (alive) {
          setData(response.overview);
          setError('');
        }
      } catch (err) {
        if (alive) {
          setData(null);
          setError(err?.message || 'GPS overview unavailable');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void poll();
    const interval = setInterval(() => { void poll(); }, 30000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const overview = !error ? data : null;
  const statuses = overview?.statuses;
  return (
    <section className="adm-card" aria-label="Distribution operations overview"
      style={{ padding: 16, marginTop: 18 }}>
      <div className="adm-card-head">
        <strong>{tr('مركز عمليات التوزيع', 'Distribution operations')}</strong>
        <div>
          <button type="button" className="btn-secondary" onClick={() => {
            setLoading(true);
            void refresh();
          }}>{tr('تحديث', 'Refresh')}</button>
          {' '}<Link to="/admin/distribution">{tr('إدارة الرحلات', 'Manage trips')}</Link>
        </div>
      </div>
      <p className="hint">
        {tr('عمليات ومواقع فقط، دون حسابات أو دفعات. الإشارة تتحدث كل 30 ثانية أثناء فتح اللوحة.',
          'Operational data only, no payments. GPS status refreshes every 30 seconds while this panel is open.')}
      </p>
      {loading && !overview && <p>{tr('جارٍ التحميل...', 'Loading...')}</p>}
      {error && <p role="alert">{tr('تعذّر تحديث العمليات. لا تعتمد على موقع قديم باعتباره مباشراً.',
        'Could not update operations. Old GPS data must not be treated as live.')}{' '}{error}</p>}
      {overview && <>
        <div className="adm-stats-grid">
          {[
            [tr('رحلات مخططة', 'Planned trips'), statuses.planned],
            [tr('رحلات جارية', 'Active trips'), statuses.in_progress],
            [tr('محطات بانتظار التسليم', 'Pending stops'), overview.pendingStops],
            [tr('رحلات مكتملة', 'Completed trips'), statuses.completed],
          ].map(([label, count]) => (
            <div className="adm-stat-card adm-stat-info" key={label}>
              <div className="adm-stat-label">{label}</div>
              <div className="adm-stat-value adm-num">{count ?? 0}</div>
            </div>
          ))}
        </div>
        <div className="adm-card-head"><strong>{tr('أولوية متابعة السائقين', 'Active driver watchlist')}</strong></div>
        {overview.activeTrips.length === 0
          ? <p className="hint">{tr('لا توجد رحلات جارية حالياً.', 'No active trips.')}</p>
          : <div className="table-scroll"><table className="wh-table">
            <thead><tr>
              <th>{tr('السائق / المنطقة', 'Driver / region')}</th>
              <th>{tr('المتبقي', 'Pending')}</th>
              <th>{tr('حالة GPS', 'GPS status')}</th>
              <th>{tr('الوقت', 'Last fix')}</th>
            </tr></thead>
            <tbody>{overview.activeTrips.map(trip => (
              <tr key={trip.id}>
                <td>{trip.driverName} — {trip.region}
                  {!trip.driverAssigned && <span> ({tr('غير مربوط بحساب', 'No account assigned')})</span>}
                </td>
                <td className="adm-num">{trip.pendingStops}/{trip.totalStops}</td>
                <td>
                  {trip.offRoute && trip.gpsState === 'live'
                    ? tr('⚠️ خارج المسار', '⚠️ Off route')
                    : (STATES[trip.gpsState] || STATES.unavailable)[arabic ? 0 : 1]}
                </td>
                <td dir="ltr">{trip.gpsMeasuredAt
                  ? new Date(trip.gpsMeasuredAt).toLocaleString(arabic ? 'ar-SY' : 'en-GB')
                  : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>}
        {overview.activeListLimited && <p className="hint">{tr(
          'القائمة تعرض أول 8 رحلات جارية فقط؛ افتح إدارة الرحلات لرؤية البقية.',
          'Showing the first 8 active trips only; open trip management for the rest.',
        )}</p>}
        <p className="hint">{tr('آخر تحديث للخادم: ', 'Server snapshot: ')}
          <time dateTime={overview.asOf}>{new Date(overview.asOf).toLocaleString(arabic ? 'ar-SY' : 'en-GB')}</time>
        </p>
      </>}
    </section>
  );
}
