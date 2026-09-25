import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';

// Duplicate review (catalog overhaul Phase 5.2): catalog items that are the
// same medicine spelled differently, which the dedupe migration could not
// merge on its own. The admin picks the item to keep and - for a warehouse that
// stocks more than one of them - which of its products survives. The others
// are merged into it (offers and package lines follow the kept product).
export function AdminDuplicatesPage() {
  const { t } = useTranslation();
  const fetchPage = useCallback(
    (cursor) =>
      api.adminCatalogDuplicates({ limit: 20, after: cursor }).then((data) => ({
        rows: data.groups,
        hasMore: data.pagination.hasMore,
        nextCursor: data.pagination.nextCursor,
      })),
    []
  );
  const { data: groups, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('duplicates.title')}</h1>
      </div>
      <p className="hint">{t('duplicates.hint')}</p>
      {error && <p className="error-text">{error}</p>}
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <p className="hint">{t('duplicates.empty')}</p>
      ) : (
        groups.map((group) => <DuplicateGroup key={group.id} group={group} onResolved={reset} />)
      )}
      <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={20} />
    </div>
  );
}

function DuplicateGroup({ group, onResolved }) {
  const { t } = useTranslation();
  const [survivorId, setSurvivorId] = useState(null);
  const [keep, setKeep] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Warehouses with a product on more than one item of the group.
  const byWarehouse = new Map();
  for (const item of group.items) {
    for (const product of item.products) {
      const key = String(product.warehouseId);
      if (!byWarehouse.has(key)) byWarehouse.set(key, { name: product.warehouseNameAr ?? product.warehouseNameEn, products: [] });
      byWarehouse.get(key).products.push({ ...product, itemName: item.nameAr });
    }
  }
  const conflicts = [...byWarehouse.entries()].filter(([, entry]) => entry.products.length > 1);
  const ready = survivorId && conflicts.every(([warehouseId]) => keep[warehouseId]);

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.resolveCatalogDuplicate(group.id, { survivorId, keepProductByWarehouse: keep });
      onResolved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="exchange-rate-card">
      <p className="hint">{group.reasons.map((reason) => t(`duplicates.reason.${reason}`)).join('، ')}</p>
      {group.items.map((item) => (
        <label key={item.id} className="adm-import-error-row">
          <input type="radio" name={`survivor-${group.id}`} checked={survivorId === item.id} onChange={() => setSurvivorId(item.id)} />{' '}
          <strong>{item.nameAr}</strong> — {item.manufacturerAr}
          {!item.isActive && <span className="hint"> ({t('duplicates.withdrawn')})</span>}
          <span className="hint"> · {t('duplicates.productCount', { count: item.products.length })}</span>
        </label>
      ))}
      {conflicts.map(([warehouseId, entry]) => (
        <div key={warehouseId}>
          <p>{t('duplicates.chooseProduct', { warehouse: entry.name })}</p>
          {entry.products.map((product) => (
            <label key={product.productId} className="adm-import-error-row">
              <input
                type="radio"
                name={`keep-${group.id}-${warehouseId}`}
                checked={keep[warehouseId] === product.productId}
                onChange={() => setKeep((prev) => ({ ...prev, [warehouseId]: product.productId }))}
              />{' '}
              {product.itemName} — ${product.priceUsd}
            </label>
          ))}
        </div>
      ))}
      <button className="btn-primary" disabled={busy || !ready} onClick={resolve}>
        {t('duplicates.merge')}
      </button>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
