import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { ManufacturerPicker } from '../components/CatalogPickers';
import { usePaginatedData } from '../hooks/usePaginatedData';

const PAGE_SIZE = 30;

// Manufacturers (catalog overhaul §1.1b): the central company list every
// catalog item points at. The admin edits the names (every copy - catalog
// items, products, discounts - follows), sets the logo pharmacists see (a
// letter avatar is drawn when there is none), and merges two spellings of one
// company into one.
export function AdminManufacturersPage() {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    (cursor) =>
      api.adminManufacturers({ search: search || undefined, limit: PAGE_SIZE, after: cursor }).then((data) => ({
        rows: data.manufacturers,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    [search]
  );
  const { data: manufacturers, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('manufacturers.title')}</h1>
      </div>
      <div className="section-toolbar section-toolbar-start">
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('manufacturers.searchPlaceholder')} />
      </div>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('manufacturers.logo')}</th>
                <th>{t('manufacturers.nameAr')}</th>
                <th>{t('manufacturers.nameEn')}</th>
                <th>{t('manufacturers.items')}</th>
                <th aria-label={t('common.edit')}></th>
              </tr>
            </thead>
            <tbody>
              {manufacturers.map((manufacturer) => (
                <ManufacturerRow key={manufacturer.id} manufacturer={manufacturer} onChanged={reset} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={PAGE_SIZE} />
    </div>
  );
}

function ManufacturerRow({ manufacturer, onChanged }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [nameAr, setNameAr] = useState(manufacturer.nameAr);
  const [nameEn, setNameEn] = useState(manufacturer.nameEn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(false);
      setMerging(false);
      onChanged();
    } catch (err) {
      if (err.code === 'MANUFACTURER_ALREADY_EXISTS') setError(t('manufacturers.nameTaken'));
      else if (err.code === 'MANUFACTURER_MERGE_CONFLICT') setError(t('manufacturers.mergeConflict'));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) run(() => api.uploadManufacturerLogo(manufacturer.id, file));
  };

  return (
    <>
      <tr>
        <td>
          {manufacturer.logoUrl ? <img src={manufacturer.logoUrl} alt="" width="40" height="40" style={{ objectFit: 'contain' }} /> : '—'}
        </td>
        <td>{editing ? <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" /> : manufacturer.nameAr}</td>
        <td>{editing ? <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /> : manufacturer.nameEn ?? '-'}</td>
        <td>{manufacturer.catalogItemCount ?? '-'}</td>
        <td>
          <div className="table-row-actions">
            {editing ? (
              <>
                <button className="btn-primary" disabled={busy} onClick={() => run(() => api.updateManufacturer(manufacturer.id, { nameAr, nameEn }))}>
                  {t('common.save')}
                </button>
                <button className="btn-secondary" onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
            )}
            <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {manufacturer.logoUrl ? t('manufacturers.replaceLogo') : t('manufacturers.uploadLogo')}
            </button>
            {manufacturer.logoUrl && (
              <button className="btn-secondary" disabled={busy} onClick={() => run(() => api.clearManufacturerLogo(manufacturer.id))}>
                {t('manufacturers.clearLogo')}
              </button>
            )}
            <button className="btn-secondary" onClick={() => setMerging(!merging)}>
              {t('manufacturers.merge')}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleLogo} />
          </div>
          {error && <p className="error-text">{error}</p>}
        </td>
      </tr>
      {merging && (
        <tr>
          <td colSpan={5}>
            <p className="hint">{t('manufacturers.mergeHint', { name: manufacturer.nameAr })}</p>
            <ManufacturerPicker
              excludeId={manufacturer.id}
              onSelect={(source) => {
                if (window.confirm(t('manufacturers.confirmMerge', { source: source.nameAr, target: manufacturer.nameAr }))) {
                  run(() => api.mergeManufacturer(manufacturer.id, source.id));
                }
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}
