import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { CatalogItemPicker, ManufacturerPicker } from '../components/CatalogPickers';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { formatBonusTiers } from '../components/ProductFormModal';

const PAGE_SIZE = 30;
const STATUSES = ['pending', 'approved', 'merged', 'rejected', 'all'];

// Catalog requests (catalog overhaul Phase 5.1): medicines warehouses asked
// to add from their import files. Approve creates the catalog item (name,
// manufacturer and category can be corrected first) and the warehouse's
// product; merge links the request to an existing item; reject sends a reason
// back. Until then the product does not exist - pharmacists can't see it.
export function AdminCatalogRequestsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('pending');
  const [categories, setCategories] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.categories().then((data) => setCategories(data.categories)).catch(() => {});
  }, []);

  const fetchPage = useCallback(
    (cursor) =>
      api.adminCatalogRequests({ status, limit: PAGE_SIZE, after: cursor }).then((data) => ({
        rows: data.requests,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    [status]
  );
  const { data: requests, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('catalogRequests.title')}</h1>
      </div>
      <div className="wh-pills">
        {STATUSES.map((value) => (
          <button key={value} className={`wh-pill${status === value ? ' active' : ''}`} onClick={() => setStatus(value)}>
            {t(`catalogRequests.status.${value}`)}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : requests.length === 0 ? (
        <p className="hint">{t('catalogRequests.empty')}</p>
      ) : (
        requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            categories={categories}
            isOpen={openId === request.id}
            onToggle={() => setOpenId(openId === request.id ? null : request.id)}
            onDone={() => {
              setOpenId(null);
              reset();
            }}
          />
        ))
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

// Arabic letters, the same test the server applies (utils/nameLanguage.js).
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export function hasArabicLetters(text) {
  return typeof text === 'string' && ARABIC_LETTER.test(text);
}

function RequestCard({ request, categories, isOpen, onToggle, onDone }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('approve'); // approve | merge | reject
  // The request keeps the name as the warehouse wrote it. The Arabic name is
  // prefilled with it (the admin must end up with an Arabic name - the server
  // refuses one with no Arabic letters); when it has none, it is likely the
  // English name, so the optional English field starts with it too.
  const [nameAr, setNameAr] = useState(request.nameAr);
  const [nameEn, setNameEn] = useState(hasArabicLetters(request.nameAr) ? '' : request.nameAr);
  const [manufacturer, setManufacturer] = useState(null); // an existing Manufacturer, or null
  const [createManufacturer, setCreateManufacturer] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [mergeTarget, setMergeTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      // An approve whose name already exists points at the item to merge into.
      if (err.code === 'ARABIC_NAME_REQUIRED') {
        setError(t('catalogRequests.arabicNameRequired'));
      } else if (err.code === 'CATALOG_ITEM_ALREADY_EXISTS') {
        setMode('merge');
        setError(t('catalogRequests.alreadyExists'));
      } else if (err.code === 'MANUFACTURER_CONFIRMATION_REQUIRED') {
        setError(t('catalogRequests.manufacturerRequired'));
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    run(() =>
      api.approveCatalogRequest(request.id, {
        nameAr,
        nameEn: nameEn || undefined,
        manufacturerId: manufacturer?.id,
        createManufacturer: !manufacturer && createManufacturer,
        categoryId: categoryId || undefined,
      })
    );

  return (
    <div className="exchange-rate-card">
      <p>
        <strong>{request.nameAr}</strong> — {request.manufacturerAr} — ${request.priceUsd}
        {request.unit && ` — ${request.unit}`}
        {request.bonuses.length > 0 && ` — ${t('importResults.bonus')} ${formatBonusTiers(request.bonuses)}`}
      </p>
      <p className="hint">
        {request.warehouseNameAr ?? request.warehouseNameEn} · {new Date(request.createdAt).toLocaleString()} ·{' '}
        {t(`catalogRequests.status.${request.status}`)}
        {request.rejectReason && ` · ${request.rejectReason}`}
      </p>
      {request.status === 'pending' && (
        <button className="btn-secondary" onClick={onToggle}>
          {isOpen ? t('common.close') : t('catalogRequests.decide')}
        </button>
      )}
      {isOpen && (
        <div className="product-form">
          <div className="wh-pills">
            {['approve', 'merge', 'reject'].map((value) => (
              <button key={value} type="button" className={`wh-pill${mode === value ? ' active' : ''}`} onClick={() => setMode(value)}>
                {t(`catalogRequests.action.${value}`)}
              </button>
            ))}
          </div>

          {mode === 'approve' && (
            <>
              <div className="form-row">
                <label>
                  {t('catalogRequests.nameAr')}
                  <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
                </label>
                <label>
                  {t('catalogRequests.nameEn')}
                  <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
                </label>
              </div>
              <label>
                {t('common.category')}
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">—</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameAr} · {category.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t('common.manufacturer')}:{' '}
                <strong>{manufacturer ? manufacturer.nameAr : request.manufacturerAr}</strong>
                {manufacturer && (
                  <button type="button" className="btn-secondary" onClick={() => setManufacturer(null)}>
                    {t('productForm.change')}
                  </button>
                )}
              </p>
              {!manufacturer && (
                <>
                  <ManufacturerPicker onSelect={setManufacturer} initialQuery={request.manufacturerAr} />
                  <label>
                    <input type="checkbox" checked={createManufacturer} onChange={(e) => setCreateManufacturer(e.target.checked)} />{' '}
                    {t('catalogRequests.createManufacturer', { name: request.manufacturerAr })}
                  </label>
                </>
              )}
              <button className="btn-primary" disabled={busy} onClick={approve}>
                {t('catalogRequests.action.approve')}
              </button>
            </>
          )}

          {mode === 'merge' && (
            <>
              {mergeTarget ? (
                <p>
                  {t('catalogRequests.mergeInto')}: <strong>{mergeTarget.nameAr}</strong> — {mergeTarget.manufacturerAr}{' '}
                  <button type="button" className="btn-secondary" onClick={() => setMergeTarget(null)}>
                    {t('productForm.change')}
                  </button>
                </p>
              ) : (
                <CatalogItemPicker onSelect={setMergeTarget} initialQuery={request.nameAr} />
              )}
              <button className="btn-primary" disabled={busy || !mergeTarget} onClick={() => run(() => api.mergeCatalogRequest(request.id, mergeTarget.id))}>
                {t('catalogRequests.action.merge')}
              </button>
            </>
          )}

          {mode === 'reject' && (
            <>
              <label>
                {t('catalogRequests.reason')}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </label>
              <button className="btn-reject" disabled={busy || !reason.trim()} onClick={() => run(() => api.rejectCatalogRequest(request.id, reason.trim()))}>
                {t('catalogRequests.action.reject')}
              </button>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  );
}
