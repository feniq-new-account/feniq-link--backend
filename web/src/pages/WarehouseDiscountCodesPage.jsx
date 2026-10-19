import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { DiscountCodeModal } from '../components/DiscountCodeModal';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { WarehouseGroupSubNav } from '../components/WarehouseGroupSubNav';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import {
  DISCOUNT_CODE_FILTERS,
  discountCodeEditSource,
  discountCodeErrorKey,
  formatDiscountValue,
  isEditable,
  isStoppable,
  statusBadgeClass,
  usageText,
} from './discountCodesFilters';
import { formatBusinessDate } from '../utils/businessDate';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

// A pharmacy-specific code can only be aimed at one of this warehouse's own
// customers - the pharmacies it holds an account with (owner's decision).
const searchCustomers = (q) =>
  api
    .warehouseBalances({ search: q, limit: 10 })
    .then((data) => data.pharmacies.map((p) => ({ id: p.pharmacyId, nameAr: p.nameAr, nameEn: p.nameEn })));

// The warehouse's discount codes: create (the admin approves before a code
// works), edit (an approved code's edit waits for the admin), stop (any time,
// no approval). Codes a pharmacy types at checkout - not the manufacturer
// discounts on /warehouse/discounts.
export function WarehouseDiscountCodesPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reviewCount, setReviewCount] = useState(0);
  // null = closed, 'new' = create, otherwise the code being edited.
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchPage = useCallback(
    (cursor) =>
      api
        .warehouseDiscountCodes({ status: statusFilter, search: search || undefined, limit: PAGE_SIZE, after: cursor })
        .then((data) => {
          setReviewCount(data.reviewCount);
          return { rows: data.discountCodes, hasMore: data.pagination.hasMore, nextCursor: data.pagination.nextCursor };
        }),
    [statusFilter, search]
  );

  const { data: codes, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  // An admin approving, rejecting or stopping one of these codes is the one
  // change to this list that happens somewhere else.
  useRealtimeSync([REALTIME_EVENTS.DISCOUNT_CODE_STATUS_UPDATED], () => reset(), { grouped: true });

  const handleStop = async (code) => {
    if (!window.confirm(t('discountCodes.warehouse.confirmStop', { code: code.code }))) return;
    setBusyId(code.id);
    setActionError(null);
    try {
      await api.stopWarehouseDiscountCode(code.id);
      reset();
    } catch (err) {
      const key = discountCodeErrorKey(err.code);
      setActionError(key ? t(key) : err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaved = () => {
    setEditing(null);
    reset();
  };

  return (
    <div>
      <WarehouseGroupSubNav />

      <div className="wh-page-head">
        <h1>{t('nav.discountCodes')}</h1>
        <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => setEditing('new')}>
          {t('discountCodes.newCode')}
        </button>
      </div>

      <p className="wh-notice">{t('discountCodes.warehouse.notice')}</p>

      <div className="wh-pills">
        {DISCOUNT_CODE_FILTERS.map((value) => (
          <button
            key={value}
            className={`wh-pill${statusFilter === value ? ' active' : ''}`}
            onClick={() => setStatusFilter(value)}
          >
            {value === 'review'
              ? t('discountCodes.filters.review', { count: reviewCount })
              : t(`discountCodes.filters.${value}`)}
          </button>
        ))}
      </div>

      <div className="wh-filters">
        <input
          type="search"
          className="wh-filter-search"
          placeholder={t('discountCodes.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {(error || actionError) && <p className="error-text">{error || actionError}</p>}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : codes.length === 0 ? (
        <p className="hint">{t('discountCodes.empty')}</p>
      ) : (
        <>
          <div className="wh-card table-scroll">
            <table className="wh-table">
              <thead>
                <tr>
                  <th>{t('discountCodes.columns.code')}</th>
                  <th>{t('discountCodes.columns.discount')}</th>
                  <th>{t('discountCodes.columns.scope')}</th>
                  <th>{t('discountCodes.columns.period')}</th>
                  <th>{t('discountCodes.columns.usage')}</th>
                  <th>{t('common.status')}</th>
                  <th aria-label={t('common.edit')}></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code.id}>
                    <td>
                      <code className="discount-code-string">{code.code}</code>
                    </td>
                    <td className="wh-num" style={{ color: 'var(--wh-orange)', fontWeight: 700 }}>
                      {formatDiscountValue(code, formatSyp)}
                      {code.pendingUpdate && (
                        <div className="wh-table-sub">
                          {t('discountCodes.proposed')}: {formatDiscountValue(code.pendingUpdate, formatSyp)}
                        </div>
                      )}
                    </td>
                    <td>
                      {code.pharmacy
                        ? displayName(code.pharmacy.nameEn, code.pharmacy.nameAr)
                        : t('discountCodes.scope.general')}
                    </td>
                    <td className="wh-num wh-table-date">
                      {formatBusinessDate(code.startDate)} — {formatBusinessDate(code.endDate)}
                    </td>
                    <td className="wh-num">
                      {usageText(code)}
                      {code.maxUsesPerPharmacy != null && (
                        <div className="wh-table-sub">
                          {t('discountCodes.perPharmacyLimit', { count: code.maxUsesPerPharmacy })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${statusBadgeClass(code.displayStatus)}`}>
                        {t(`discountCodes.status.${code.displayStatus}`)}
                      </span>
                      {code.pendingUpdate && (
                        <div className="wh-badge-review">{t('discountCodes.updatePendingBadge')}</div>
                      )}
                      {code.rejectionNote && (
                        <div className="wh-table-sub">{t('common.rejectionReason', { reason: code.rejectionNote })}</div>
                      )}
                    </td>
                    <td>
                      <div className="table-row-actions">
                        {isEditable(code) && (
                          <button className="btn-secondary" onClick={() => setEditing(code)}>
                            {t('common.edit')}
                          </button>
                        )}
                        {isStoppable(code) && (
                          <button className="btn-reject" disabled={busyId === code.id} onClick={() => handleStop(code)}>
                            {t('discountCodes.stop')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={PAGE_SIZE} />
        </>
      )}

      {editing && (
        <DiscountCodeModal
          mode={editing === 'new' ? 'create' : 'edit'}
          code={editing === 'new' ? null : discountCodeEditSource(editing)}
          searchPharmacies={searchCustomers}
          isWarehouse
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onSubmit={(payload) =>
            editing === 'new'
              ? api.createWarehouseDiscountCode(payload)
              : api.updateWarehouseDiscountCode(editing.id, payload)
          }
        />
      )}
    </div>
  );
}
