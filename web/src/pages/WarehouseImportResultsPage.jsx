import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { localizedName } from '../utils/displayName';

const PAGE_SIZE = 50;

// The results of one warehouse Excel import (catalog overhaul Phase 4.6): one
// tab per outcome, with its count. The "needs review" tab is where the
// warehouse finishes the import - each row there can be matched to a catalog
// item (live search / one-click suggestion), kept as the price of a duplicate,
// fixed inline (unit, bonus, currency), or turned into a request for a new
// catalog item. A resolved row leaves the list; unresolved ones stay here for
// later (see the recent imports list).
const TABS = [
  { bucket: 'added', countKey: 'added' },
  { bucket: 'updated', countKey: 'updated' },
  { bucket: 'added_disabled', countKey: 'addedDisabled' },
  { bucket: 'blocked', countKey: 'blocked' },
  { bucket: 'review', countKey: 'review' },
  { bucket: 'error', countKey: 'errors', hideWhenEmpty: true },
  { bucket: 'resolved', countKey: 'resolved', hideWhenEmpty: true },
];

// What the file called the row: its name column and, when the file had a
// separate English column too, that one after it.
function rawRowName(row) {
  const { name, nameEn } = row.raw;
  if (name && nameEn) return `${name} / ${nameEn}`;
  return name || nameEn || '-';
}

function formatBonusTiers(tiers) {
  return (tiers ?? []).map((tier) => `${tier.buy}+${tier.free}`).join('، ');
}

export function WarehouseImportResultsPage() {
  const { t } = useTranslation();
  const { batchId } = useParams();
  const [batch, setBatch] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [bucket, setBucket] = useState(null);
  const [units, setUnits] = useState([]);

  const loadBatch = useCallback(async () => {
    try {
      const data = await api.warehouseImport(batchId);
      setBatch(data.import);
      setBucket((current) => current ?? (data.import.counts.review > 0 ? 'review' : 'added'));
    } catch (err) {
      setBatchError(err.message);
    }
  }, [batchId]);

  useEffect(() => {
    loadBatch();
    api.units().then((data) => setUnits(data.units)).catch(() => {});
  }, [loadBatch]);

  const fetchPage = useCallback(
    (cursor) =>
      api.warehouseImportRows(batchId, { bucket, limit: PAGE_SIZE, after: cursor }).then((data) => ({
        rows: data.rows,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    [batchId, bucket]
  );
  const { data: rows, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    if (bucket) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  // After a row is resolved: its tab and the counts both change.
  const handleResolved = () => {
    reset();
    loadBatch();
  };

  if (batchError) return <p className="error-text">{batchError}</p>;
  if (!batch) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <Link className="wh-detail-back" to="/warehouse/products">
        &larr; {t('importResults.backToCatalog')}
      </Link>
      <div className="wh-page-head">
        <h1>{t('importResults.title')}</h1>
        <span className="wh-page-head-meta">
          {batch.fileName ?? ''} · {new Date(batch.createdAt).toLocaleString()}
          {batch.exchangeRateUsed != null && ` · ${t('products.importConvertedRate', { rate: batch.exchangeRateUsed })}`}
        </span>
      </div>

      <div className="wh-pills">
        {TABS.filter((tab) => !tab.hideWhenEmpty || batch.counts[tab.countKey] > 0).map((tab) => (
          <button
            key={tab.bucket}
            className={`wh-pill${bucket === tab.bucket ? ' active' : ''}`}
            onClick={() => setBucket(tab.bucket)}
          >
            {t(`importResults.tab.${tab.bucket}`)} ({batch.counts[tab.countKey]})
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="hint">{t('importResults.empty')}</p>
      ) : bucket === 'review' ? (
        <div>
          {rows.map((row) => (
            <ReviewRow key={row.id} batchId={batchId} row={row} units={units} onResolved={handleResolved} />
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('importResults.row')}</th>
                <th>{t('importResults.name')}</th>
                <th>{t('importResults.manufacturer')}</th>
                <th>{t('importResults.price')}</th>
                <th>{t('importResults.unit')}</th>
                <th>{t('importResults.bonus')}</th>
                <th>{t('importResults.note')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.rowNumber}</td>
                  <td>{rawRowName(row)}</td>
                  <td>{row.raw.manufacturer}</td>
                  <td>
                    {row.raw.price} {row.raw.currency}
                    {row.parsed.priceUsd != null && <span className="hint"> (${row.parsed.priceUsd})</span>}
                  </td>
                  <td>{row.raw.unit}</td>
                  <td>{row.raw.bonus || formatBonusTiers(row.parsed.bonuses)}</td>
                  <td>
                    {row.blockedCode
                      ? t(`importResults.blocked.${row.blockedCode}`)
                      : row.reasons.map((reason) => t(`importResults.reason.${reason}`)).join('، ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

// One row waiting for the warehouse.
function ReviewRow({ batchId, row, units, onResolved }) {
  const { t } = useTranslation();
  const [name, setName] = useState(row.raw.name ?? '');
  const [manufacturer, setManufacturer] = useState(row.raw.manufacturer ?? '');
  const [suggestions, setSuggestions] = useState(row.suggestions ?? []);
  const [unit, setUnit] = useState(row.parsed.unit ?? '');
  const [bonus, setBonus] = useState(row.raw.bonus ?? '');
  const [currency, setCurrency] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const searchId = useRef(0);
  const touched = useRef(false);

  const needsUnit = row.reasons.includes('unknown_unit');
  const needsBonus = row.reasons.includes('bad_bonus');
  const needsCurrency = row.reasons.includes('missing_currency') || row.reasons.includes('unknown_currency');
  const isDuplicate = row.reasons.includes('duplicate_in_file');

  // Live search as the name/manufacturer are edited - debounced, and only the
  // newest response is allowed to land (a slow broad search must not overwrite
  // the narrower one typed after it).
  useEffect(() => {
    if (!touched.current) return undefined;
    const id = ++searchId.current;
    const timer = setTimeout(async () => {
      try {
        const data = await api.warehouseCatalogSuggestions({ name, manufacturer });
        if (id === searchId.current) setSuggestions(data.suggestions);
      } catch {
        if (id === searchId.current) setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name, manufacturer]);

  // Only the fixes this row actually needs are sent.
  const fixes = () => {
    const body = {};
    if (needsUnit && unit) body.unit = unit;
    if (needsBonus) body.bonus = bonus;
    if (needsCurrency && currency) body.currency = currency;
    return body;
  };

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onResolved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const resolveWith = (masterProductId) =>
    run(() => api.resolveWarehouseImportRow(batchId, row.id, { ...fixes(), ...(masterProductId ? { masterProductId } : {}) }));

  const requestNew = () =>
    run(() => api.requestCatalogItemFromImportRow(batchId, row.id, { ...fixes(), nameAr: name, manufacturerAr: manufacturer }));

  return (
    <div className="exchange-rate-card">
      <p>
        <strong>
          {t('importResults.row')} {row.rowNumber}:
        </strong>{' '}
        {rawRowName(row)} — {row.raw.manufacturer} — {row.raw.price} {row.raw.currency}
        {row.raw.unit && ` — ${row.raw.unit}`}
        {row.raw.bonus && ` — ${t('importResults.bonus')} ${row.raw.bonus}`}
      </p>
      <p className="hint">{row.reasons.map((reason) => t(`importResults.reason.${reason}`)).join('، ')}</p>

      <div className="product-form">
        <div className="section-toolbar section-toolbar-start">
          {needsUnit && (
            <label>
              {t('importResults.unit')}
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.nameAr}
                  </option>
                ))}
              </select>
            </label>
          )}
          {needsBonus && (
            <label>
              {t('importResults.bonus')}
              <input value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="10+1" />
            </label>
          )}
          {needsCurrency && (
            <label>
              {t('importResults.currency')}
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">—</option>
                <option value="SYP">SYP</option>
                <option value="USD">USD</option>
              </select>
            </label>
          )}
        </div>

        {isDuplicate || row.masterProductId ? (
          <button className="btn-primary" disabled={busy} onClick={() => resolveWith(null)}>
            {isDuplicate ? t('importResults.keepThisPrice') : t('importResults.confirmRow')}
          </button>
        ) : (
          <>
            <div className="section-toolbar section-toolbar-start">
              <label>
                {t('importResults.name')}
                <input
                  value={name}
                  onChange={(e) => {
                    touched.current = true;
                    setName(e.target.value);
                  }}
                />
              </label>
              <label>
                {t('importResults.manufacturer')}
                <input
                  value={manufacturer}
                  onChange={(e) => {
                    touched.current = true;
                    setManufacturer(e.target.value);
                  }}
                />
              </label>
            </div>
            {suggestions.length > 0 ? (
              <ul>
                {suggestions.map((s) => (
                  <li key={s.masterProductId}>
                    <button className="btn-secondary" disabled={busy} onClick={() => resolveWith(s.masterProductId)}>
                      {t('importResults.pick')}
                    </button>{' '}
                    {localizedName(s.nameEn, s.nameAr)} — {localizedName(s.manufacturerEn, s.manufacturerAr)}{' '}
                    <span className="hint">({Math.round(s.score * 100)}%)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{t('importResults.noSuggestions')}</p>
            )}
            <button className="btn-secondary" disabled={busy} onClick={requestNew}>
              {t('importResults.requestNewItem')}
            </button>
          </>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// The warehouse's recent imports - where unresolved review rows are picked up
// again later.
export function WarehouseImportsPage() {
  const { t } = useTranslation();
  const fetchPage = useCallback(
    (cursor) =>
      api.warehouseImports({ limit: 20, after: cursor }).then((data) => ({
        rows: data.imports,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    []
  );
  const { data: imports, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div>
      <Link className="wh-detail-back" to="/warehouse/products">
        &larr; {t('importResults.backToCatalog')}
      </Link>
      <div className="wh-page-head">
        <h1>{t('importResults.recentTitle')}</h1>
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('importResults.date')}</th>
                <th>{t('importResults.file')}</th>
                <th>{t('importResults.tab.added')}</th>
                <th>{t('importResults.tab.updated')}</th>
                <th>{t('importResults.tab.review')}</th>
                <th aria-label={t('common.view')}></th>
              </tr>
            </thead>
            <tbody>
              {imports.map((batch) => (
                <tr key={batch.id}>
                  <td>{new Date(batch.createdAt).toLocaleString()}</td>
                  <td>{batch.fileName ?? '-'}</td>
                  <td>{batch.counts.added + batch.counts.addedDisabled}</td>
                  <td>{batch.counts.updated}</td>
                  <td>{batch.counts.review}</td>
                  <td>
                    <Link className="btn-secondary" to={`/warehouse/products/imports/${batch.id}`}>
                      {t('importResults.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={20} />
      <MyCatalogRequests />
    </div>
  );
}

// The warehouse's own requests for new catalog items (raised from import
// rows) - where it sees the admin's decision, and the reason if rejected.
function MyCatalogRequests() {
  const { t } = useTranslation();
  const fetchPage = useCallback(
    (cursor) =>
      api.warehouseCatalogRequests({ limit: 20, after: cursor }).then((data) => ({
        rows: data.requests,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    []
  );
  const { data: requests, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div>
      <div className="wh-page-head">
        <h2>{t('catalogRequests.myTitle')}</h2>
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : requests.length === 0 ? (
        <p className="hint">{t('catalogRequests.empty')}</p>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('importResults.date')}</th>
                <th>{t('importResults.name')}</th>
                <th>{t('importResults.manufacturer')}</th>
                <th>{t('common.status')}</th>
                <th>{t('catalogRequests.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{new Date(request.createdAt).toLocaleString()}</td>
                  <td>{localizedName(request.nameEn, request.nameAr)}</td>
                  <td>{request.manufacturerAr}</td>
                  <td>{t(`catalogRequests.status.${request.status}`)}</td>
                  <td>{request.rejectReason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={20} />
    </div>
  );
}
