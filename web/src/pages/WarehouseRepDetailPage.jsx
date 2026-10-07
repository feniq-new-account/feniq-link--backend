import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import {
  isVisitDue,
  lastSeenKey,
  toLocalPhone,
  visitStatusKey,
  visitStatusTone,
  visitStickerHtml,
} from '../utils/reps';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';

const VISITS_PAGE_SIZE = 20;
const TONE_STYLE = {
  ok: { color: '#1f7a3f' },
  warn: { color: '#b54708' },
  muted: { color: '#6b7280' },
};

// One rep: the pharmacies the warehouse assigned to them (with when each was
// last visited and ordered), finding and assigning more, printing a
// pharmacy's visit QR, and the rep's visit log.
export function WarehouseRepDetailPage() {
  const { t, i18n } = useTranslation();
  const { repId } = useParams();
  const [rep, setRep] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const pharmacyName = (p) => (i18n.language === 'en' ? p.nameEn || p.nameAr : p.nameAr || p.nameEn);
  const lastSeen = (value) => {
    const { key, count } = lastSeenKey(value);
    return t(key, { count });
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.warehouseRepPharmacies(repId);
      setRep(data.rep);
      setPharmacies(data.pharmacies);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [repId]);

  useEffect(() => {
    load();
  }, [load]);

  const fetchVisits = useCallback(
    (cursor) =>
      api.warehouseRepVisits({ repId, limit: VISITS_PAGE_SIZE, after: cursor }).then((data) => ({
        rows: data.visits,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    [repId]
  );
  const visits = usePaginatedData(fetchVisits);

  useEffect(() => {
    visits.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repId]);

  useRealtimeSync([REALTIME_EVENTS.REP_VISIT_CREATED], () => {
    visits.reset();
    load();
  });

  const search = async (event) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      setResults(null);
      setError(t('reps.searchHint'));
      return;
    }
    setError(null);
    setIsSearching(true);
    try {
      const data = await api.searchPharmaciesForReps(query.trim());
      setResults(data.pharmacies);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const assign = async (pharmacy) => {
    const name = pharmacyName(pharmacy);
    if (pharmacy.currentRep) {
      if (pharmacy.currentRep.id === rep.id) return;
      const ok = window.confirm(t('reps.confirmMove', { pharmacy: name, from: pharmacy.currentRep.name, to: rep.name }));
      if (!ok) return;
    }
    setError(null);
    try {
      await api.assignPharmacyRep(pharmacy.id, rep.id);
      setResults((rows) => rows?.map((row) => (row.id === pharmacy.id ? { ...row, currentRep: { id: rep.id, name: rep.name } } : row)));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const unassign = async (pharmacy) => {
    if (!window.confirm(t('reps.confirmUnassign', { pharmacy: pharmacyName(pharmacy), name: rep.name }))) return;
    setError(null);
    try {
      await api.assignPharmacyRep(pharmacy.id, null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const printQr = async (pharmacy) => {
    // Opened synchronously, before the awaits, so the browser treats it as
    // part of the click and does not block it as a popup.
    const win = window.open('', '_blank');
    setError(null);
    try {
      const data = await api.pharmacyVisitCode(pharmacy.id);
      const svg = await QRCode.toString(data.qrPayload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      const html = visitStickerHtml({
        pharmacyName: pharmacyName(data.pharmacy),
        address: data.pharmacy.address,
        svg,
        code: data.code,
        labels: {
          title: t('reps.sticker.title'),
          brand: t('reps.sticker.brand'),
          hint: t('reps.sticker.hint'),
        },
      });
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
      }
    } catch (err) {
      if (win) win.close();
      setError(err.message);
    }
  };

  if (isLoading) return <p className="hint">{t('common.loading')}</p>;

  return (
    <div>
      <Link className="wh-detail-back" to="/warehouse/reps">
        ← {t('reps.back')}
      </Link>
      {error && <p className="error-text">{error}</p>}
      {rep && (
        <>
          <div className="wh-page-head">
            <h1>{t('reps.assignedPharmacies', { name: rep.name })}</h1>
            <span className="wh-num" dir="ltr">
              {toLocalPhone(rep.phone)}
            </span>
          </div>
          {!rep.isActive && <p className="hint">{t('reps.inactive')}</p>}

          {pharmacies.length === 0 ? (
            <div className="wh-empty-state">
              <div className="wh-empty-state-title">{t('reps.noPharmacies')}</div>
            </div>
          ) : (
            <div className="wh-card" style={{ overflowX: 'auto' }}>
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>{t('reps.pharmacy')}</th>
                    <th>{t('reps.area')}</th>
                    <th>{t('reps.lastVisit')}</th>
                    <th>{t('reps.lastOrder')}</th>
                    <th>{t('reps.monthOrders')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pharmacies.map((pharmacy) => (
                    <tr key={pharmacy.id}>
                      <td>
                        {pharmacyName(pharmacy)}
                        <div className="wh-table-sub">{pharmacy.address}</div>
                        {!pharmacy.hasLocation && <div className="wh-table-sub">⚠ {t('reps.noLocation')}</div>}
                      </td>
                      <td>{pharmacy.areaType ? t(`reps.areaType.${pharmacy.areaType}`) : ''}</td>
                      <td>
                        {lastSeen(pharmacy.activity.lastVerifiedVisitAt)}
                        {isVisitDue(pharmacy.activity.lastVerifiedVisitAt) && (
                          <div className="wh-table-sub" style={TONE_STYLE.warn}>
                            {t('reps.visitDue')}
                          </div>
                        )}
                      </td>
                      <td>{lastSeen(pharmacy.activity.lastOrderAt)}</td>
                      <td>
                        <span className="wh-num">{pharmacy.activity.monthOrdersCount}</span>
                        <div className="wh-table-sub wh-num">{formatSyp(pharmacy.activity.monthOrdersTotal)}</div>
                      </td>
                      <td>
                        <div className="wh-row-actions">
                          <button type="button" onClick={() => printQr(pharmacy)}>
                            {t('reps.printQr')}
                          </button>
                          <button type="button" onClick={() => unassign(pharmacy)}>
                            {t('reps.unassign')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="wh-detail-card" style={{ marginTop: 24 }}>
            <h2 className="wh-detail-card-title">{t('reps.assignTitle', { name: rep.name })}</h2>
            <form onSubmit={search} className="wh-filters">
              <input
                className="wh-filter-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('reps.searchPlaceholder')}
              />
              <button
                type="submit"
                className="btn-secondary"
                style={{ width: 'auto', marginTop: 0 }}
                disabled={isSearching}
              >
                {t('reps.search')}
              </button>
            </form>
            {results && results.length === 0 && <p className="hint">{t('reps.noResults')}</p>}
            {results && results.length > 0 && (
              <table className="wh-table">
                <tbody>
                  {results.map((pharmacy) => (
                    <tr key={pharmacy.id}>
                      <td>
                        {pharmacyName(pharmacy)}
                        <div className="wh-table-sub">
                          {pharmacy.ownerName} · {pharmacy.address}
                        </div>
                      </td>
                      <td>
                        {pharmacy.currentRep ? t('reps.currentRep', { name: pharmacy.currentRep.name }) : ''}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {pharmacy.currentRep?.id !== rep.id && (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ width: 'auto', marginTop: 0 }}
                            disabled={!rep.isActive}
                            onClick={() => assign(pharmacy)}
                          >
                            {pharmacy.currentRep ? t('reps.move') : t('reps.assign')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="wh-detail-card" style={{ marginTop: 24 }}>
            <h2 className="wh-detail-card-title">{t('reps.visitLog')}</h2>
            {visits.error && <p className="error-text">{visits.error}</p>}
            {visits.isLoading ? (
              <p className="hint">{t('common.loading')}</p>
            ) : visits.data.length === 0 ? (
              <p className="hint">{t('reps.noVisits')}</p>
            ) : (
              <>
                <table className="wh-table">
                  <thead>
                    <tr>
                      <th>{t('reps.when')}</th>
                      <th>{t('reps.pharmacy')}</th>
                      <th>{t('reps.status')}</th>
                      <th>{t('reps.distance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.data.map((visit) => (
                      <tr key={visit.id}>
                        <td className="wh-num">{new Date(visit.scannedAt).toLocaleString()}</td>
                        <td>{visit.pharmacy ? pharmacyName(visit.pharmacy) : ''}</td>
                        <td style={TONE_STYLE[visitStatusTone(visit.status)]}>{t(visitStatusKey(visit.status))}</td>
                        <td className="wh-num">
                          {visit.distanceMeters != null ? t('reps.meters', { count: visit.distanceMeters }) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <LoadMoreControl
                  hasMore={visits.hasMore}
                  isLoadingMore={visits.isLoadingMore}
                  onLoadMore={visits.loadMore}
                  pageSize={VISITS_PAGE_SIZE}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
