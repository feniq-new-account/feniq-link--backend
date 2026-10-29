import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { asciiDigits } from '../utils/digits';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { LoadMoreControl } from '../components/LoadMoreControl';

export function AdminVisitVerificationPage() {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState(null);
  const [search, setSearch] = useState('');
  const [approval, setApproval] = useState('pending');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const list = usePaginatedData(async (after) => {
    const result = await api.listAdminPharmacyLocations({ search, approval, after });
    return { rows: result.pharmacies, ...result.pagination };
  });
  const loadPolicy = useCallback(async () => {
    setError(null);
    try { setPolicy((await api.getVisitVerification()).policy); }
    catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { loadPolicy(); }, [loadPolicy]);
  useEffect(() => { list.reset(); setDrafts({}); }, [search, approval, list.reset]);
  const savePolicy = async (event) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const body = Object.fromEntries(['radiusMeters', 'maxAccuracyMeters', 'maxAgeSeconds', 'version']
        .map((key) => [key, Number(asciiDigits(policy[key]))]));
      setPolicy((await api.saveVisitVerification(body)).policy); setNotice(t('visitVerification.saved'));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const draftFor = (row) => drafts[row.id] || {
    latitude: row.location?.coordinates?.[1] ?? '', longitude: row.location?.coordinates?.[0] ?? '', approval: row.approval,
  };
  const edit = (row, key, value) => setDrafts((previous) => ({ ...previous,
    [row.id]: { ...draftFor(row), [key]: asciiDigits(value) },
  }));
  const saveLocation = async (event, row) => {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      const draft = draftFor(row);
      if (String(draft.latitude).trim() === '' || String(draft.longitude).trim() === '') {
        setError(t('visitVerification.coordinatesRequired')); return;
      }
      await api.saveAdminPharmacyLocation(row.id, { latitude: Number(draft.latitude), longitude: Number(draft.longitude),
        approval: draft.approval, version: row.version });
      setNotice(t('visitVerification.saved')); setDrafts({}); await list.reset();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="warehouse-access-page">
    <h1>{t('visitVerification.title')}</h1>
    <p className="hint">{t('visitVerification.help')}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!policy && <button className="btn-secondary" onClick={loadPolicy}>{t('common.retry')}</button>}
    {policy && <form onSubmit={savePolicy} className="warehouse-access-policy">
      <fieldset disabled={busy}><legend>{t('visitVerification.policy')}</legend>
        {['radiusMeters', 'maxAccuracyMeters', 'maxAgeSeconds'].map((key) => <label key={key}>
          {t(`visitVerification.${key}`)}
          <input dir="ltr" inputMode="numeric" required value={policy[key]}
            onChange={(event) => setPolicy((old) => ({ ...old, [key]: asciiDigits(event.target.value) }))} />
        </label>)}
        <button type="submit" className="btn-primary">{t('visitVerification.savePolicy')}</button>
        <button type="button" className="btn-secondary" onClick={loadPolicy}>{t('visitVerification.reload')}</button>
      </fieldset>
    </form>}
    <h2>{t('visitVerification.pharmacies')}</h2>
    <label>{t('visitVerification.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <label>{t('visitVerification.status')}<select value={approval} onChange={(event) => setApproval(event.target.value)}>
      {['pending', 'approved', 'all'].map((value) => <option key={value} value={value}>{t(`visitVerification.${value}`)}</option>)}
    </select></label>
    <button className="btn-secondary" type="button" disabled={busy} onClick={list.reset}>{t('visitVerification.refreshList')}</button>
    {list.isLoading && <p>{t('common.loading')}</p>}
    {list.error && <div><p role="alert" className="error-text">{list.error}</p><button className="btn-secondary" onClick={list.reset}>{t('common.retry')}</button></div>}
    {!list.isLoading && !list.error && list.data.length === 0 && <p>{t('visitVerification.empty')}</p>}
    <div className="warehouse-access-layout">
      {list.data.map((row) => {
        const draft = draftFor(row);
        const lat = Number(draft.latitude), lng = Number(draft.longitude);
        const hasPoint = String(draft.latitude).trim() && String(draft.longitude).trim() && Number.isFinite(lat) && Number.isFinite(lng);
        return <form key={row.id} onSubmit={(event) => saveLocation(event, row)}>
          <fieldset disabled={busy}><legend>{row.nameAr || row.nameEn}</legend>
            <p>{row.city} · {row.address}</p><p dir="ltr">{asciiDigits(row.phone)}</p>
            <p>{t(`visitVerification.${row.approval}`)}</p>
            {['latitude', 'longitude'].map((key) => <label key={key}>{t(`visitVerification.${key}`)}
              <input required dir="ltr" inputMode="decimal" value={draft[key]} onChange={(event) => edit(row, key, event.target.value)} />
            </label>)}
            {hasPoint && <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
              target="_blank" rel="noreferrer">{t('visitVerification.map')}</a>}
            <label>{t('visitVerification.status')}<select value={draft.approval} onChange={(event) => edit(row, 'approval', event.target.value)}>
              <option value="pending">{t('visitVerification.pending')}</option>
              <option value="approved">{t('visitVerification.approved')}</option>
            </select></label>
            <p className="hint">{t('visitVerification.approvalHelp')}</p>
            <button className="btn-primary" type="submit">{t('visitVerification.saveLocation')}</button>
          </fieldset>
        </form>;
      })}
    </div>
    {list.data.length > 0 && <LoadMoreControl hasMore={list.hasMore} isLoadingMore={list.isLoadingMore} onLoadMore={list.loadMore} pageSize={20} />}
  </section>;
}
