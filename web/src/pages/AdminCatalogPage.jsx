import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImportColumnMappingModal } from '../components/ImportColumnMappingModal';
import { ManufacturerPicker } from '../components/CatalogPickers';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { SearchableSelect } from '../components/SearchableSelect';
import { usePaginatedData } from '../hooks/usePaginatedData';

const PAGE_SIZE = 30;

// Section: edits the fields updateCatalogItem accepts (nameAr/nameEn/unitAr/
// categoryId/isActive) - see productCatalog.service.js. The Arabic name is the
// medicine's name (required, the one shown); the English name is optional,
// never shown - search and the warehouse import also match on it. The
// isActive toggle stays its own row button (mirrors the mockup's separate
// "toggle" action), so it's left out of this form.
function EditCatalogItemModal({ item, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const [nameAr, setNameAr] = useState(item.nameAr ?? '');
  const [nameEn, setNameEn] = useState(item.nameEn ?? '');
  const [unitAr, setUnitAr] = useState(item.unitAr ?? '');
  const [categoryId, setCategoryId] = useState(item.categoryId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!nameAr.trim()) {
      setError(t('common.requiredFields'));
      return;
    }

    const changes = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || null,
      unitAr: unitAr.trim() || null,
      categoryId: categoryId || null,
    };

    setIsSaving(true);
    try {
      await api.updateCatalogItem(item.id, changes);
      onSaved();
    } catch (err) {
      // A rename reaches every warehouse stocking this medicine, and every
      // open cart, because the name is resolved live rather than copied onto
      // each product. The server refuses the first attempt and sends the
      // count back, so the admin sees the scale before agreeing to it.
      if (err.code === 'CATALOG_RENAME_NEEDS_CONFIRMATION') {
        const count = err.details?.linkedProductCount ?? 0;
        const confirmed = window.confirm(
          t('admin.catalog.confirmRename', {
            count,
            oldName: err.details?.currentNameAr ?? item.nameAr,
            newName: err.details?.nextNameAr ?? changes.nameAr,
          })
        );
        if (!confirmed) {
          setIsSaving(false);
          return;
        }
        try {
          await api.updateCatalogItem(item.id, changes, { confirmed: true });
          onSaved();
        } catch (retryError) {
          setError(retryError.message);
        } finally {
          setIsSaving(false);
        }
        return;
      }
      setError(err.message);
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{t('admin.catalog.editTitle')}</h2>
        <form onSubmit={handleSubmit} className="product-form">
          <p className="hint">{item.manufacturerAr}</p>
          <label>
            {t('admin.catalog.nameArLabel')}
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" required />
          </label>
          <label>
            {t('admin.catalog.nameEnLabel')}
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
          </label>
          <label>
            {t('productForm.unitAr')}
            <input value={unitAr} onChange={(e) => setUnitAr(e.target.value)} dir="rtl" />
          </label>
          <label>
            {t('common.category')}
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('admin.catalog.noCategoryOption')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameEn}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Section: the import-result dialog (mockup frame 1g) - a distinct
// sharp-cornered overlay rather than the generic rounded `.modal`, since the
// mockup calls it out as its own component with its own stat cards.
// `onConfirmNewManufacturers(names)` re-imports the same file creating the
// manufacturers the admin ticked (catalog overhaul Phase 4.3: an unknown
// manufacturer is never created silently).
function ImportResultModal({ report, fileName, onClose, onConfirmNewManufacturers, isImporting }) {
  const { t } = useTranslation();
  const withdrawn = report.withdrawn ?? [];
  // Rows imported without a category because the file's category matched none
  // (the import never creates a category).
  const unknownCategories = report.unknownCategories ?? [];
  const newManufacturers = report.newManufacturers ?? [];
  const skippedForManufacturers = newManufacturers.reduce((sum, m) => sum + m.rows.length, 0);
  const totalRows = report.added + report.updated + report.errors.length + withdrawn.length + skippedForManufacturers;
  const [toCreate, setToCreate] = useState(() => new Set(newManufacturers.map((m) => m.name)));
  // { rawName: { id, nameAr } } - an unknown name filed under an existing company instead.
  const [links, setLinks] = useState({});
  const [linkingName, setLinkingName] = useState(null);
  const toggleCreate = (name) =>
    setToCreate((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handleDownloadErrors = () => {
    const lines = ['row,reason', ...report.errors.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'catalog-import-errors.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="adm-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="adm-import-title">{t('admin.catalog.importResultTitle')}</div>
        <div className="adm-import-file">
          {t('admin.catalog.importSummary', { fileName, count: totalRows })}
        </div>
        <div className="adm-import-stats">
          <div className="adm-import-stat adm-import-stat-added">
            <div className="adm-import-stat-value">{report.added}</div>
            <div className="adm-import-stat-label">{t('admin.catalog.importResultAdded')}</div>
          </div>
          <div className="adm-import-stat adm-import-stat-updated">
            <div className="adm-import-stat-value">{report.updated}</div>
            <div className="adm-import-stat-label">{t('admin.catalog.importResultUpdated')}</div>
          </div>
          <div className="adm-import-stat adm-import-stat-failed">
            <div className="adm-import-stat-value">{report.errors.length}</div>
            <div className="adm-import-stat-label">{t('admin.catalog.importResultFailed')}</div>
          </div>
        </div>
        {report.convertedFromSyp > 0 && (
          <div className="adm-import-conversion">
            <div>{t('admin.catalog.importConverted', { count: report.convertedFromSyp })}</div>
            {report.exchangeRateUsed != null && (
              <div>{t('admin.catalog.importConvertedRate', { rate: report.exchangeRateUsed })}</div>
            )}
          </div>
        )}
        {newManufacturers.length > 0 && (
          <div className="adm-import-errors">
            <div className="adm-import-errors-head">{t('admin.catalog.newManufacturersTitle')}</div>
            <p className="hint">{t('admin.catalog.newManufacturersHint')}</p>
            {newManufacturers.map((manufacturer) => (
              <label key={manufacturer.name} className="adm-import-error-row">
                <input
                  type="checkbox"
                  checked={toCreate.has(manufacturer.name)}
                  onChange={() => toggleCreate(manufacturer.name)}
                />{' '}
                {manufacturer.name}{' '}
                <span className="hint">({t('admin.catalog.rowsCount', { count: manufacturer.rows.length })})</span>{' '}
                {links[manufacturer.name] ? (
                  <span>
                    → {links[manufacturer.name].nameAr}{' '}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setLinks(({ [manufacturer.name]: _removed, ...rest }) => rest)}
                    >
                      {t('productForm.change')}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn-secondary" onClick={() => setLinkingName(manufacturer.name)}>
                    {t('admin.catalog.linkExisting')}
                  </button>
                )}
              </label>
            ))}
            {linkingName && (
              <ManufacturerPicker
                initialQuery={linkingName}
                onSelect={(m) => {
                  setLinks((prev) => ({ ...prev, [linkingName]: m }));
                  setToCreate((prev) => {
                    const next = new Set(prev);
                    next.delete(linkingName);
                    return next;
                  });
                  setLinkingName(null);
                }}
              />
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={isImporting || (toCreate.size === 0 && Object.keys(links).length === 0)}
              onClick={() =>
                onConfirmNewManufacturers(
                  [...toCreate],
                  Object.fromEntries(Object.entries(links).map(([name, m]) => [name, m.id]))
                )
              }
            >
              {isImporting ? t('products.importing') : t('admin.catalog.createAndReimport')}
            </button>
          </div>
        )}
        {withdrawn.length > 0 && (
          <div className="adm-import-errors">
            <div className="adm-import-errors-head">{t('admin.catalog.withdrawnTitle')}</div>
            {withdrawn.map((w) => (
              <div key={w.row} className="adm-import-error-row">
                <span className="adm-import-error-row-num">{w.row}</span>
                {w.nameAr}
              </div>
            ))}
          </div>
        )}
        {unknownCategories.length > 0 && (
          <div className="adm-import-errors">
            <div className="adm-import-errors-head">{t('admin.catalog.unknownCategoriesTitle')}</div>
            <p className="hint">{t('admin.catalog.unknownCategoriesHint')}</p>
            {unknownCategories.map((u) => (
              <div key={u.row} className="adm-import-error-row">
                <span className="adm-import-error-row-num">{u.row}</span>
                {u.category}
              </div>
            ))}
          </div>
        )}
        {report.errors.length > 0 && (
          <div className="adm-import-errors">
            <div className="adm-import-errors-head">{t('admin.catalog.importErrorsTitle')}</div>
            {report.errors.map((e, index) => (
              <div key={index} className="adm-import-error-row">
                <span className="adm-import-error-row-num">{e.row}</span>
                {e.reason}
              </div>
            ))}
          </div>
        )}
        <div className="adm-import-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t('admin.catalog.importDone')}
          </button>
          {report.errors.length > 0 && (
            <button type="button" className="btn-secondary" onClick={handleDownloadErrors}>
              {t('admin.catalog.downloadErrorReport')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Section 14 Part 1: the admin-curated master medicine list. Excel-import
// only - there's deliberately no "add medicine" button/form here, matching
// the backend (no POST /admin/catalog, see adminCatalog.routes.js).
export function AdminCatalogPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  // Separate from actionError: disabling an entry that took warehouse
  // products with it succeeded - the count is a consequence to report, not a
  // failure.
  const [actionNotice, setActionNotice] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  // The last uploaded file - re-sent when the admin confirms new manufacturers
  // or maps the columns.
  const [lastImportFile, setLastImportFile] = useState(null);
  const [pendingMapping, setPendingMapping] = useState(null); // null | { details }
  const [importFileName, setImportFileName] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.categories().then((data) => setCategories(data.categories));
  }, []);

  const fetchPage = useCallback(
    (cursor) =>
      api
        .adminCatalog({
          search,
          categoryId: categoryFilter || undefined,
          manufacturer: manufacturerFilter || undefined,
          limit: PAGE_SIZE,
          after: cursor,
        })
        .then((data) => ({
          rows: data.items,
          hasMore: data.pagination.hasMore,
          nextCursor: data.pagination.nextCursor,
        })),
    [search, categoryFilter, manufacturerFilter]
  );

  const fetchManufacturerOptions = useCallback(
    (term) => api.searchAdminManufacturers(term).then((data) => data.manufacturers),
    []
  );

  const { data: items, isLoading, isLoadingMore, hasMore, error, loadMore, reset } =
    usePaginatedData(fetchPage);

  // Category/manufacturer are discrete choices, so they reload immediately on
  // change - only the free-text search waits for the form's submit button
  // (handleSearchSubmit).
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, manufacturerFilter]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    reset();
  };

  const handleDownloadTemplate = async () => {
    setActionError(null);
    try {
      const blob = await api.downloadCatalogTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'product-catalog-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    await runImport(file);
  };

  const runImport = async (file, options = {}) => {
    setIsImporting(true);
    setActionError(null);
    try {
      const report = await api.importCatalogExcel(file, options);
      setImportReport(report);
      setImportFileName(file.name);
      setLastImportFile(file);
      setPendingMapping(null);
      reset();
    } catch (err) {
      if (err.code === 'IMPORT_COLUMNS_UNRECOGNIZED') {
        setLastImportFile(file);
        setPendingMapping({ details: err.details });
      } else {
        setActionError(err.message);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleImagePicked = async (item, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      await api.uploadCatalogImage(item.id, file);
      reset();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleClearImage = async (item) => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await api.clearCatalogImage(item.id);
      reset();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (item) => {
    setBusyId(item.id);
    setActionError(null);
    setActionNotice(null);
    try {
      if (item.isActive) {
        // Disabling now removes this medicine from every warehouse stocking
        // it, not just from this list - the server reports how many products
        // went with it, and that is worth saying out loud rather than
        // letting the admin find out later.
        // The recall also stops those products' offers and takes them out of
        // any package - the counts come back so all of it can be said.
        const result = await api.deactivateCatalogItem(item.id);
        if (result.deactivatedProductCount > 0) {
          setActionNotice(
            t('admin.catalog.disabledWithProducts', { count: result.deactivatedProductCount }) +
              (result.stoppedOfferCount > 0 || result.affectedPackageCount > 0
                ? ` ${t('admin.catalog.disabledSideEffects', {
                    offers: result.stoppedOfferCount ?? 0,
                    packages: result.affectedPackageCount ?? 0,
                  })}`
                : '')
          );
        }
      } else {
        // Re-enabling the entry brings back exactly the products its recall
        // took (not ones a warehouse or admin disabled themselves); stopped
        // offers and removed package lines are not restored.
        const result = await api.updateCatalogItem(item.id, { isActive: true });
        if (result.restoredProductCount > 0) {
          setActionNotice(t('admin.catalog.reenabledWithProducts', { count: result.restoredProductCount }));
        }
      }
      reset();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleEditSaved = () => {
    setEditingItem(null);
    reset();
  };

  return (
    <div>
      <div className="adm-page-head">
        <h1>{t('nav.centralCatalog')}</h1>
        <div className="adm-page-head-actions">
          <button className="btn-secondary" onClick={handleDownloadTemplate}>
            {t('products.downloadTemplate')}
          </button>
          <button
            className="btn-primary"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            {isImporting ? t('products.importing') : t('products.importExcel')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={handleFilePicked}
          />
        </div>
      </div>

      <form className="adm-filters-row" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          className="adm-filter-search"
          placeholder={t('admin.catalog.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">
          {t('common.search')}
        </button>
        <select
          className="adm-filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">{t('products.allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nameEn}
            </option>
          ))}
        </select>
        <SearchableSelect
          value={manufacturerFilter}
          onChange={setManufacturerFilter}
          fetchOptions={fetchManufacturerOptions}
          placeholder={t('products.manufacturerFilterPlaceholder')}
          allLabel={t('products.allManufacturers')}
          loadingLabel={t('common.loading')}
          noMatchesLabel={t('common.noMatches')}
        />
      </form>

      {(error || actionError) && <p className="error-text">{error || actionError}</p>}
      {actionNotice && <p className="hint">{actionNotice}</p>}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="adm-empty-state">
          <div className="adm-empty-state-icon">&#128138;</div>
          <div className="adm-empty-state-title">{t('admin.catalog.noEntries')}</div>
        </div>
      ) : (
        <>
          <div className="adm-card table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.manufacturer')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('admin.pendingAccounts.actionColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={item.isActive ? '' : 'row-inactive'}>
                    <td>
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="" width="32" height="32" style={{ objectFit: 'contain', marginInlineEnd: 8 }} />
                      )}
                      {item.nameAr}
                    </td>
                    <td>{item.manufacturerAr}</td>
                    <td>
                      <span
                        className={`availability-badge ${item.isActive ? 'availability-available' : 'availability-paused'}`}
                      >
                        {item.isActive ? t('admin.catalog.active') : t('admin.catalog.disabled')}
                      </span>
                    </td>
                    <td>
                      <div className="adm-row-actions">
                        <button className="adm-row-action" onClick={() => setEditingItem(item)}>
                          {t('common.edit')}
                        </button>
                        <button
                          className={`adm-row-action ${item.isActive ? 'adm-row-action-danger' : ''}`}
                          disabled={busyId === item.id}
                          onClick={() => handleToggleActive(item)}
                        >
                          {item.isActive ? t('admin.catalog.disable') : t('admin.catalog.enable')}
                        </button>
                        {/* The central image every warehouse product of this medicine shows (Phase 5.3). */}
                        <label className="adm-row-action">
                          {item.imageUrl ? t('admin.catalog.replaceImage') : t('admin.catalog.uploadImage')}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(event) => handleImagePicked(item, event)}
                          />
                        </label>
                        {item.imageUrl && (
                          <button className="adm-row-action" disabled={busyId === item.id} onClick={() => handleClearImage(item)}>
                            {t('admin.catalog.clearImage')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LoadMoreControl
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      {editingItem && (
        <EditCatalogItemModal
          item={editingItem}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onSaved={handleEditSaved}
        />
      )}

      {importReport && (
        <ImportResultModal
          key={importReport.added + ':' + importReport.updated + ':' + (importReport.newManufacturers?.length ?? 0)}
          report={importReport}
          fileName={importFileName}
          isImporting={isImporting}
          onClose={() => setImportReport(null)}
          onConfirmNewManufacturers={(names, manufacturerLinks) =>
            runImport(lastImportFile, { confirmNewManufacturers: names, manufacturerLinks })
          }
        />
      )}
      {pendingMapping && (
        <ImportColumnMappingModal
          details={pendingMapping.details}
          isSubmitting={isImporting}
          onClose={() => setPendingMapping(null)}
          onSubmit={(mapping) => runImport(lastImportFile, { mapping })}
        />
      )}
    </div>
  );
}
