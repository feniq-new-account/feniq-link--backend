import { NumericInput } from './NumericInput';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { asciiDigits } from '../utils/digits';

const newSlot = () => ({ weekday: 6, departureTime: '10:00', arrivalHours: 4, cutoffHours: 12 });
const newZone = () => ({ name: '', active: true, preparationHours: 2, slots: [newSlot()], exceptions: [] });
export function DeliveryScheduleCard() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null), [entitled, setEntitled] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [q, setQ] = useState(''), [pharmacies, setPharmacies] = useState([]), [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const generation = useRef(0);
  const dirty = useRef(false);
  async function load() {
    setError('');
    try { const result = await api.deliverySettings(); setSettings(result.settings); setEntitled(result.entitled); dirty.current = false; }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { let live = true; api.deliverySettings().then((result) => {
    if (live) { setSettings(result.settings); setEntitled(result.entitled); }
  }).catch((err) => { if (live) setError(err.message); }); return () => { live = false; generation.current++; }; }, []);
  function change(next) { dirty.current = true; setSaved(false); setSettings(next); }
  function zoneChange(index, next) { change({ ...settings, zones: settings.zones.map((zone, i) => i === index ? next : zone) }); }
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try { const result = await api.updateDeliverySettings(settings); setSettings(result.settings); dirty.current = false; setSaved(true); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function search(event) {
    event.preventDefault(); if (searching || busy || q.trim().length < 2) return;
    const current = ++generation.current; setSearching(true); setSearchError(''); setPharmacies([]);
    try { const result = await api.deliveryPharmacies(q.trim()); if (generation.current === current) setPharmacies(result.pharmacies); }
    catch (err) { if (generation.current === current) setSearchError(err.message); }
    finally { if (generation.current === current) setSearching(false); }
  }
  async function assign(pharmacy, zoneId) {
    if (busy || dirty.current) return;
    setBusy(true); setSearchError('');
    try {
      const result = await api.assignDeliveryPharmacy(pharmacy.id, { zoneId: zoneId || null, revision: pharmacy.assignment.revision });
      setPharmacies((rows) => rows.map((row) => row.id === pharmacy.id ? { ...row, assignment: result.assignment } : row));
    } catch (err) { setSearchError(err.message); } finally { setBusy(false); }
  }
  const number = (value) => asciiDigits(value) === '' ? '' : Number(asciiDigits(value));
  return <section className="wh-detail-card delivery-settings">
    <h2>{t('delivery.title')}</h2><p className="hint">{t('delivery.explanation')}</p>
    {error && <div role="alert" className="error">{error}<button type="button" onClick={load} disabled={busy}>{t('delivery.reload')}</button></div>}
    {saved && <p role="status">{t('delivery.saved')}</p>}
    {!settings ? <p>{t('common.loading')}</p> : <>
      {!entitled && <p className="hint">{t('delivery.featureOff')}</p>}
      <form onSubmit={save}>
        <fieldset disabled={busy || !entitled}>
          <label className="delivery-toggle"><input type="checkbox" checked={settings.enabled} onChange={(e) => change({ ...settings, enabled: e.target.checked })} />{t('delivery.enable')}</label>
          {settings.zones.map((zone, index) => <section className="delivery-zone" key={zone._id || `new-${index}`}>
            <div className="delivery-fields">
              <label>{t('delivery.zoneName')}<input required maxLength={80} value={zone.name} onChange={(e) => zoneChange(index, { ...zone, name: e.target.value })} /></label>
              <label>{t('delivery.preparation')}<NumericInput dir="ltr" inputMode="decimal" required type="number" min="0" max="168" step="0.25" value={zone.preparationHours} onChange={(e) => zoneChange(index, { ...zone, preparationHours: number(e.target.value) })} /></label>
              <label className="delivery-toggle"><input type="checkbox" checked={zone.active} onChange={(e) => zoneChange(index, { ...zone, active: e.target.checked })} />{t('delivery.zoneActive')}</label>
            </div>
            {zone.slots.map((slot, slotIndex) => <div className="delivery-fields" key={slotIndex}>
              <label>{t('delivery.day')}<select value={slot.weekday} onChange={(e) => zoneChange(index, { ...zone, slots: zone.slots.map((s, j) => j === slotIndex ? { ...s, weekday: Number(e.target.value) } : s) })}>{Array.from({ length: 7 }, (_, day) => <option value={day} key={day}>{t(`delivery.days.${day}`)}</option>)}</select></label>
              {['departureTime', 'arrivalHours', 'cutoffHours'].map((field) => <label key={field}>{t(`delivery.${field}`)}<input dir="ltr" type={field === 'departureTime' ? 'time' : 'number'} min="0" max={field === 'arrivalHours' ? '72' : '168'} step={field === 'departureTime' ? '60' : '0.25'} required value={slot[field]} onChange={(e) => zoneChange(index, { ...zone, slots: zone.slots.map((s, j) => j === slotIndex ? { ...s, [field]: field === 'departureTime' ? e.target.value : number(e.target.value) } : s) })} /></label>)}
              <button type="button" className="btn-secondary" onClick={() => zoneChange(index, { ...zone, slots: zone.slots.filter((_, j) => j !== slotIndex) })}>{t('delivery.removeTrip')}</button>
            </div>)}
            <button type="button" className="btn-secondary" disabled={zone.slots.length >= 7} onClick={() => zoneChange(index, { ...zone, slots: [...zone.slots, { ...newSlot(), weekday: Array.from({ length: 7 }, (_, n) => n).find((n) => !zone.slots.some((s) => s.weekday === n)) }] })}>{t('delivery.addTrip')}</button>
            <details><summary>{t('delivery.exceptions')}</summary>
              {zone.exceptions.map((exception, j) => <div className="delivery-fields" key={j}>
                <label>{t('delivery.date')}<input dir="ltr" required type="date" value={exception.date} onChange={(e) => zoneChange(index, { ...zone, exceptions: zone.exceptions.map((ex, k) => k === j ? { ...ex, date: e.target.value } : ex) })} /></label>
                <label className="delivery-toggle"><input type="checkbox" checked={exception.cancelled} onChange={(e) => zoneChange(index, { ...zone, exceptions: zone.exceptions.map((ex, k) => k === j ? { ...ex, cancelled: e.target.checked } : ex) })} />{t('delivery.cancelTrip')}</label>
                {!exception.cancelled && ['departureTime', 'arrivalHours', 'cutoffHours'].map((field) => <label key={field}>{t(`delivery.${field}`)}<input dir="ltr" required type={field === 'departureTime' ? 'time' : 'number'} min="0" max={field === 'arrivalHours' ? '72' : '168'} step={field === 'departureTime' ? '60' : '0.25'} value={exception[field]} onChange={(e) => zoneChange(index, { ...zone, exceptions: zone.exceptions.map((ex, k) => k === j ? { ...ex, [field]: field === 'departureTime' ? e.target.value : number(e.target.value) } : ex) })} /></label>)}
                <button type="button" onClick={() => zoneChange(index, { ...zone, exceptions: zone.exceptions.filter((_, k) => k !== j) })}>{t('delivery.removeException')}</button>
              </div>)}
              <button type="button" disabled={zone.exceptions.length >= 90} onClick={() => zoneChange(index, { ...zone, exceptions: [...zone.exceptions, { ...newSlot(), date: '', cancelled: true }] })}>{t('delivery.addException')}</button>
            </details>
            <button type="button" className="btn-secondary" onClick={() => zoneChange(index, { ...zone, active: false })}>{t('delivery.pauseZone')}</button>
          </section>)}
          <div className="delivery-fields"><button type="button" disabled={settings.zones.length >= 30} onClick={() => change({ ...settings, zones: [...settings.zones, newZone()] })}>{t('delivery.addZone')}</button><button type="submit" className="btn-primary">{busy ? t('common.loading') : t('delivery.save')}</button></div>
        </fieldset>
      </form>
      {entitled && <section><h3>{t('delivery.assignTitle')}</h3><p className="hint">{t('delivery.assignHint')}</p>
        <form className="delivery-fields" onSubmit={search}><label>{t('delivery.search')}<input value={q} minLength={2} disabled={busy || searching} onChange={(e) => setQ(e.target.value)} /></label><button disabled={busy || searching || q.trim().length < 2}>{searching ? t('common.loading') : t('delivery.searchButton')}</button></form>
        {searchError && <p role="alert">{searchError}</p>}
        {pharmacies.map((pharmacy) => <label className="delivery-assignment" key={pharmacy.id}><span>{pharmacy.nameAr || pharmacy.nameEn}<small>{pharmacy.city} · {pharmacy.address}</small></span><select aria-label={`${t('delivery.zoneName')} ${pharmacy.nameAr || pharmacy.nameEn}`} disabled={busy || dirty.current} value={pharmacy.assignment.zoneId || ''} onChange={(e) => assign(pharmacy, e.target.value)}><option value="">{t('delivery.unassigned')}</option>{pharmacy.assignment.zoneId && !settings.zones.some((zone) => zone._id === pharmacy.assignment.zoneId) && <option value={pharmacy.assignment.zoneId}>{t('delivery.unassigned')}</option>}{settings.zones.filter((zone) => zone._id).map((zone) => <option value={zone._id} key={zone._id}>{zone.name}{zone.active ? '' : ` (${t('delivery.paused')})`}</option>)}</select></label>)}
      </section>}
    </>}
  </section>;
}
