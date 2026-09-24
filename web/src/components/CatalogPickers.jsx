import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

// A debounced type-ahead where only the newest response is allowed to land -
// a slow broad search must never overwrite the narrower one typed after it.
function useLatestSearch(query, fetcher) {
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const items = await fetcher(query.trim());
        if (id === requestId.current) setResults(items);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { results, isSearching };
}

// Picks a central Manufacturer (the admin's catalog requests, manufacturer
// merge, and the catalog import's "link to an existing company").
export function ManufacturerPicker({ onSelect, excludeId, initialQuery = '' }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const { results, isSearching } = useLatestSearch(query, (q) =>
    api.adminManufacturers({ search: q, limit: 10 }).then((data) => data.manufacturers)
  );
  return (
    <div className="catalog-search-field">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('manufacturers.searchPlaceholder')} />
      {isSearching && <p className="hint">{t('productForm.searching')}</p>}
      <ul>
        {results
          .filter((m) => m.id !== excludeId)
          .map((m) => (
            <li key={m.id}>
              <button type="button" className="btn-secondary" onClick={() => onSelect(m)}>
                {t('importResults.pick')}
              </button>{' '}
              {m.nameAr}
              {m.nameEn ? ` · ${m.nameEn}` : ''}
            </li>
          ))}
      </ul>
    </div>
  );
}

// Picks an existing central-catalog item (merging a catalog request into it).
export function CatalogItemPicker({ onSelect, initialQuery = '' }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const { results, isSearching } = useLatestSearch(query, (q) =>
    api.adminCatalog({ search: q, limit: 10 }).then((data) => data.items)
  );
  return (
    <div className="catalog-search-field">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('productForm.searchPlaceholder')} />
      {isSearching && <p className="hint">{t('productForm.searching')}</p>}
      <ul>
        {results.map((item) => (
          <li key={item.id}>
            <button type="button" className="btn-secondary" disabled={!item.isActive} onClick={() => onSelect(item)}>
              {t('importResults.pick')}
            </button>{' '}
            {item.nameAr} — {item.manufacturerAr}
            {!item.isActive && <span className="hint"> ({t('importResults.blocked.CATALOG_ITEM_WITHDRAWN')})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Picks one product by searching for it, a page at a time (catalog overhaul
// Phase 10, H4) - it replaced the <select>s that downloaded every product
// first. `search(query)` returns the matching products; `selected` is the
// current pick (an object with at least `id`) or null; `renderLabel` names a
// product in the results and in the selected state. With `allowClear`, the
// selected state can go back to "no product".
export function ProductPicker({ search, selected, onChange, renderLabel, placeholder, allowClear = false }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { results, isSearching } = useLatestSearch(query, search);

  if (selected) {
    return (
      <div className="product-picker-selected">
        <span>{renderLabel(selected)}</span>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setQuery('');
            onChange(null);
          }}
        >
          {allowClear ? t('productPicker.clear') : t('productPicker.change')}
        </button>
      </div>
    );
  }

  return (
    <div className="catalog-search-field product-picker">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? t('productPicker.searchPlaceholder')}
      />
      {isSearching && <p className="hint">{t('productForm.searching')}</p>}
      {results.length > 0 && (
        <ul className="catalog-search-results">
          {results.map((product) => (
            <li key={product.id}>
              <button type="button" onClick={() => onChange(product)}>
                {renderLabel(product)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isSearching && query.trim() && results.length === 0 && <p className="hint">{t('productForm.noMatch')}</p>}
    </div>
  );
}
