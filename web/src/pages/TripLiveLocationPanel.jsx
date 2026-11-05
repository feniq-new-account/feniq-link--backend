import { useEffect, useState } from 'react';
import { api } from '../api/client';

function copyLocationLink(latitude, longitude) {
  // The user opens the external map deliberately; we do not send positions
  // to a mapping provider during passive dashboard rendering.
  const lat = Number(latitude), lon = Number(longitude);
  return 'https://www.openstreetmap.org/?mlat=' + lat +
    '&mlon=' + lon + '#map=15/' + lat + '/' + lon;
}

export function TripLiveLocationPanel({ trip, onRouteSaved, arabic = true }) {
  const tr = (ar, en) => arabic ? ar : en;
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [pollFailed, setPollFailed] = useState(false);
  const [routeText, setRouteText] = useState('');
  const [corridor, setCorridor] = useState('300');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled || trip.status !== 'in_progress') return undefined;
    let live = true;
    async function check() {
      try {
        const response = await api.adminTripLiveLocation(trip._id);
        if (live) {
          setResult(response.location);
          setPollFailed(false);
          setError('');
        }
      } catch (err) {
        if (live) {
          setPollFailed(true);
          setError(err?.message || 'GPS unavailable');
        }
      }
    }
    void check();
    const timer = setInterval(() => { void check(); }, 20000);
    return () => { live = false; clearInterval(timer); };
  }, [enabled, trip._id, trip.status]);

  async function saveRoute(event) {
    event.preventDefault();
    const routePoints = routeText.trim().split(/\r?\n/).map(row =>
      row.split(',').map(v => Number(v.trim())));
    if (routePoints.length < 2 || routePoints.length > 500 ||
        routePoints.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))) ||
        !Number.isInteger(Number(corridor)) || Number(corridor) < 100 || Number(corridor) > 2000) {
      setError(tr('أدخل نقطتين على الأقل بالشكل: خط العرض,خط الطول، وعرض ممر 100–2000 متر.',
        'Enter at least two lat,lon points and corridor width 100–2000 m.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.adminSaveTripRoute(trip._id, trip.revision, routePoints, Number(corridor));
      setRouteText('');
      if (onRouteSaved) await onRouteSaved();
    } catch (err) {
      setError(err?.message || 'Could not save route');
    } finally {
      setSaving(false);
    }
  }

  if (trip.status === 'planned') return (
    <details>
      <summary>{tr('تحديد خط الرحلة الحقيقي لتنبيهات الانحراف',
        'Set actual route geometry for deviation alerts')}</summary>
      <p>{tr(
        'الصق نقاط الطريق بالترتيب (خط العرض,خط الطول)، نقطة في كل سطر. يجب أن تتبع الطريق الحقيقي، وليس خطوطًا مستقيمة بين الصيدليات.',
        'Paste consecutive road-route latitude,longitude points, one per line. Use the actual road shape, not straight lines between pharmacies.',
      )}</p>
      <form onSubmit={saveRoute}>
        <textarea aria-label="Route coordinates" rows={4}
          placeholder={'35.50,35.82\n35.51,35.83'} value={routeText}
          onChange={e => setRouteText(e.target.value)} />
        <label>{tr('سماحية الانحراف بالأمتار', 'Corridor allowance (meters)')}
          <input type="number" min={100} max={2000} value={corridor}
            onChange={e => setCorridor(e.target.value)} />
        </label>
        <button type="submit" disabled={saving}>
          {tr('اعتماد خط الطريق', 'Save route polyline')}
        </button>
      </form>
      {Array.isArray(trip.routePoints) && trip.routePoints.length >= 2 &&
        <p>{tr('يوجد خط معتمد لهذه الرحلة.', 'A route polyline is already configured.')}</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
  if (trip.status !== 'in_progress') return null;

  const location = result?.location;
  const state = pollFailed ? 'unreachable' : result?.state;
  const deviation = result?.deviation;
  const offRoute = state === 'live' && deviation?.state === 'off_route';
  return (
    <section aria-label="Driver GPS monitoring">
      {!enabled ? (
        <button type="button" onClick={() => setEnabled(true)}>
          {tr('عرض موقع السائق المباشر', 'Monitor live driver position')}
        </button>
      ) : (
        <>
          <button type="button" onClick={() => setEnabled(false)}>
            {tr('إيقاف عرض الموقع', 'Stop monitoring')}
          </button>
          {error && <p role="alert">{error}</p>}
          {!result && !pollFailed && <p>{tr('جارٍ قراءة الموقع...', 'Loading GPS position...')}</p>}
          {state === 'unreachable' && <p role="status">{location
            ? tr('تعذّر الاتصال بخادم التتبع — آخر موقع محفوظ (ليس مباشرًا).',
                'Tracking server unreachable — last known position (not live).')
            : tr('تعذّر الاتصال بخادم التتبع، ولا توجد قراءة موقع محفوظة.',
                'Tracking server unreachable; no saved location is available.')}</p>}
          {state === 'no_signal' && <p>{tr('لا توجد قراءة GPS حديثة.', 'No GPS fix received.')}</p>}
          {state === 'stale' && <p role="status">{tr(
            'انقطع التتبع — آخر موقع مسجل (ليس موقعًا مباشرًا).',
            'GPS signal lost — last known position (not live).',
          )}</p>}
          {state === 'live' && (
            <p role={offRoute ? 'alert' : 'status'}>
              {offRoute ? tr('⚠️ السائق خارج خط الرحلة المحدد', '⚠️ Driver is outside the planned route')
                : deviation?.state === 'on_route' ? tr('ضمن المسار المحدد', 'Within route corridor')
                : tr('الموقع ظاهر، لكن خط الطريق لم يُضبط بعد.', 'Location available; route not configured.')}
              {deviation?.distanceMeters != null &&
                ' — ' + deviation.distanceMeters + ' m'}
            </p>
          )}
          {location && <>
            <p>
              {tr('الإحداثيات: ', 'Coordinates: ')}
              {Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}
            </p>
            <p>
              {tr('وقت آخر قراءة: ', 'Last received: ')}
              {new Date(location.receivedAt).toLocaleString(arabic ? 'ar-SY' : 'en-US')}
              {' — ±'}{Math.round(location.accuracyMeters)} m
            </p>
            <a href={copyLocationLink(location.latitude, location.longitude)}
              target="_blank" rel="noopener noreferrer">
              {tr('افتح موقع السائق على الخريطة', 'Open driver location on map')}
            </a>
          </>}
        </>
      )}
    </section>
  );
}
