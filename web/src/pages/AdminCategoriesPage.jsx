import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// Merges category `sourceId` into `targetId` in two steps: the first call is
// refused with CATEGORY_MERGE_NEEDS_CONFIRMATION carrying how many catalog
// items and warehouse products would move; `confirm(details)` shows the admin
// those counts, and only a yes sends the confirmed merge. Resolves to the
// merge result, or null when the admin said no.
export async function mergeCategoryWithConfirmation(targetId, sourceId, confirm) {
  try {
    return await api.mergeCategory(targetId, sourceId);
  } catch (err) {
    if (err.code !== 'CATEGORY_MERGE_NEEDS_CONFIRMATION') throw err;
    if (!confirm(err.details)) return null;
    return api.mergeCategory(targetId, sourceId, { confirmed: true });
  }
}

const labelOf = (category) =>
  category.nameEn && category.nameEn !== category.nameAr ? `${category.nameAr} (${category.nameEn})` : category.nameAr;

// Categories: the list pharmacists browse by. The catalog import creates a
// category the file names that matches none (with the file's text as both
// names), so this is where the admin gives it proper names, or folds a
// spelling variant into the category it should have been. Items point at a
// category by id: a rename keeps them all; a merge moves them all.
export function AdminCategoriesPage() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.adminCategories();
      setCategories(data.categories);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('categories.title')}</h1>
      </div>
      <p className="hint">{t('categories.hint')}</p>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : categories.length === 0 ? (
        <p className="hint">{t('categories.empty')}</p>
      ) : (
        <div className="table-scroll">
          <table className="product-table">
            <thead>
              <tr>
                <th>{t('categories.nameAr')}</th>
                <th>{t('categories.nameEn')}</th>
                <th>{t('categories.catalogItems')}</th>
                <th>{t('categories.products')}</th>
                <th aria-label={t('common.edit')}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <CategoryRow key={category.id} category={category} categories={categories} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ category, categories, onChanged }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [nameAr, setNameAr] = useState(category.nameAr);
  const [nameEn, setNameEn] = useState(category.nameEn);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const done = await fn();
      if (done === null) return; // the admin said no to the merge
      setEditing(false);
      setMerging(false);
      setSourceId('');
      onChanged();
    } catch (err) {
      if (err.code === 'CATEGORY_ALREADY_EXISTS') setError(t('categories.nameTaken'));
      else if (err.code === 'INVALID_CATEGORY_NAME') setError(t('categories.nameRequired'));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setNameAr(category.nameAr);
    setNameEn(category.nameEn);
    setEditing(true);
  };

  const merge = () =>
    run(() =>
      mergeCategoryWithConfirmation(category.id, sourceId, (details) =>
        window.confirm(
          t('categories.confirmMerge', {
            source: details.source.nameAr,
            target: details.target.nameAr,
            catalogItems: details.catalogItemCount,
            products: details.productCount,
          })
        )
      )
    );

  return (
    <>
      <tr>
        <td>{editing ? <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" /> : category.nameAr}</td>
        <td>{editing ? <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /> : category.nameEn}</td>
        <td>{category.catalogItemCount}</td>
        <td>{category.productCount}</td>
        <td>
          <div className="table-row-actions">
            {editing ? (
              <>
                <button className="btn-primary" disabled={busy} onClick={() => run(() => api.updateCategory(category.id, { nameAr, nameEn }))}>
                  {t('common.save')}
                </button>
                <button className="btn-secondary" onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button className="btn-secondary" onClick={startEditing}>
                {t('common.edit')}
              </button>
            )}
            <button className="btn-secondary" onClick={() => setMerging(!merging)}>
              {t('categories.merge')}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </td>
      </tr>
      {merging && (
        <tr>
          <td colSpan={5}>
            <p className="hint">{t('categories.mergeHint', { name: category.nameAr })}</p>
            <div className="table-row-actions">
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">{t('categories.mergePick')}</option>
                {categories
                  .filter((other) => other.id !== category.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {labelOf(other)}
                    </option>
                  ))}
              </select>
              <button className="btn-primary" disabled={busy || !sourceId} onClick={merge}>
                {t('categories.mergeAction')}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
