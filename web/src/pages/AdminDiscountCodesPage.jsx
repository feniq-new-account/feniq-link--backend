import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { DiscountCodeModal } from '../components/DiscountCodeModal';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import {
  ADMIN_DISCOUNT_CODE_VIEWS,
  DISCOUNT_CODE_FILTERS,
  discountCodeErrorKey,
  formatDiscountValue,
  isInReview,
  isStoppable,
  statusBadgeClass,
  usageText,
} from './discountCodesFilters';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

// An admin code can be aimed at any approved pharmacy.
const searchPharmacies = (q) =>
  api
    .adminAccounts({ role: 'pharmacy', status: 'active', search: q, limit: 10 })
    .then((data) =>
      data.accounts
        .filter((account) => account.pharmacy)
        .map((account) => ({ id: account.pharmacy.id, nameAr: account.pharmacy.nameAr, nameEn: account.pharmacy.nameEn }))
    );

// Discount codes, the admin's side. Three views:
//   - Review: warehouse codes waiting for a decision (a new code, or an edit
//     parked on an approved one) - approve, or reject with a reason;
//   - Admin codes: the platform's own - live at once, work on every warehouse,
//     paid by the platform (the compensation shows on the Commission page);
//   - All codes: every code, every owner.
// Any code can be stopped from any view.
export function AdminDiscountCodesPage() {
  const { t } = useTranslation();
  const [view, setView] = useState('review');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [reviewCount, setReviewCount] = useState(0);
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
        .adminDiscountCodes({
          view,
          status: view === 'review' ? undefined : statusFilter,
          search: search || undefined,
          limit: PAGE_SIZE,
          after: cursor,
        })
        .then((data) => {
          setReviewCount(data.reviewCount);
          return { rows: data.discountCodes, hasMore: data.pagination.hasMore, nextCursor: data.pagination.nextCursor };
        }),
    [view, statusFilter, search]
  );

  const { data: codes, isLoading, isLoadingMore, hasMore, error, loadMore, reset } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, statusFilter, search]);

  // A warehouse submitting or stopping a code, and another admin deciding one.
  useRealtimeSync(
    [REALTIME_EVENTS.DISCOUNT_CODE_PENDING, REALTIME_EVENTS.DISCOUNT_CODE_STATUS_UPDATED],
    () => reset(),
    { grouped: true }
  );

  const runAction = async (codeId, fn) => {
    setBusyId(codeId);
    setActionError(null);
    try {
      await fn();
      reset();
    } catch (err) {
      const key = discountCodeErrorKey(err.code);
      setActionError(key ? t(key) : err.message);
      // The warehouse changed it while it was on screen: show what is there now.
      if (err.code === 'DISCOUNT_CODE_VERSION_CONFLICT' || err.code === 'DISCOUNT_CODE_NOT_IN_REVIEW') reset();
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = (code) => {
    if (!window.confirm(t('discountCodes.admin.confirmApprove', { code: code.code }))) return;
    runAction(code.id, () => api.approveDiscountCode(code.id, code.version));
  };

  const handleReject = (code) => {
    const note = window.prompt(
      t(code.pendingUpdate ? 'discountCodes.admin.rejectUpdatePrompt' : 'discountCodes.admin.rejectPrompt', {
        code: code.code,
      })
    );
    if (note === null) return;
    if (!note.trim()) {
      setActionError(t('discountCodes.errors.rejectionNoteRequired'));
      return;
    }
    runAction(code.id, () => api.rejectDiscountCode(code.id, note.trim(), code.version));
  };

  const handleStop = (code) => {
    if (!window.confirm(t('discountCodes.admin.confirmStop', { code: code.code }))) return;
    runAction(code.id, () => api.stopAdminDiscountCode(code.id));
  };

  const handleSaved = () => {
    setEditing(null);
    reset();
  };

  const ownerText = (code) =>
    code.ownerRole === 'admin'
      ? t('discountCodes.admin.allWarehouses')
      : displayName(code.warehouse?.nameEn, code.warehouse?.nameAr);

  const periodText = (terms) =>
    `${new Date(terms.startDate).toLocaleDateString()} — ${new Date(terms.endDate).toLocaleDateString()}`;

  return (
    <div>
      <div className="adm-page-head">
        <h1>{t('nav.discountCodes')}</h1>
        <button className="btn-primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => setEditing('new')}>
          {t('discountCodes.newCode')}
        </button>
      </div>
      <p className="hint">{t('discountCodes.admin.fundingHint')}</p>

      <div className="adm-pills">
        {ADMIN_DISCOUNT_CODE_VIEWS.map((value) => (
          <button key={value} className={`adm-pill${view === value ? ' active' : ''}`} onClick={() => setView(value)}>
            {value === 'review'
              ? t('discountCodes.admin.views.review', { count: reviewCount })
              : t(`discountCodes.admin.views.${value}`)}
          </button>
        ))}
      </div>

      <div className="adm-filters-row">
        <input
          type="search"
          className="adm-filter-search"
          placeholder={t('discountCodes.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {view !== 'review' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {DISCOUNT_CODE_FILTERS.filter((value) => value !== 'review').map((value) => (
              <option key={value} value={value}>
                {t(`discountCodes.filters.${value}`)}
              </option>
            ))}
          </select>
        )}
      </div>

      {(error || actionError) && <p className="error-text">{error || actionError}</p>}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : codes.length === 0 ? (
        <div className="adm-empty-state">
          <div className="adm-empty-state-icon">&#10003;</div>
          <div className="adm-empty-state-title">
            {view === 'review' ? t('discountCodes.admin.reviewEmpty') : t('discountCodes.empty')}
          </div>
        </div>
      ) : (
        <>
          <div className="adm-card table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('discountCodes.columns.code')}</th>
                  <th>{t('discountCodes.columns.owner')}</th>
                  <th>{t('discountCodes.columns.discount')}</th>
                  <th>{t('discountCodes.columns.scope')}</th>
                  <th>{t('discountCodes.columns.period')}</th>
                  <th>{t('discountCodes.columns.usage')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('admin.pendingAccounts.actionColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => {
                  const u = code.pendingUpdate;
                  return (
                    <tr key={code.id}>
                      <td>
                        <code className="discount-code-string">{code.code}</code>
                      </td>
                      <td>
                        {ownerText(code)}
                        <div className="adm-table-sub">{t(`discountCodes.fundedBy.${code.fundedBy}`)}</div>
                      </td>
                      <td className="adm-num adm-offer-discount">
                        {formatDiscountValue(code, formatSyp)}
                        {u && (
                          <div className="adm-offer-proposed">
                            {t('discountCodes.proposed')}: <strong>{formatDiscountValue(u, formatSyp)}</strong>
                          </div>
                        )}
                      </td>
                      <td>
                        {code.pharmacy
                          ? displayName(code.pharmacy.nameEn, code.pharmacy.nameAr)
                          : t('discountCodes.scope.general')}
                      </td>
                      <td className="adm-num">
                        {periodText(code)}
                        {u && (
                          <div className="adm-offer-proposed">
                            {t('discountCodes.proposed')}: <strong>{periodText(u)}</strong>
                          </div>
                        )}
                      </td>
                      <td className="adm-num">
                        {usageText(code)}
                        {code.maxUsesPerPharmacy != null && (
                          <div className="adm-table-sub">
                            {t('discountCodes.perPharmacyLimit', { count: code.maxUsesPerPharmacy })}
                          </div>
                        )}
                        {u && (u.maxUses !== code.maxUses || u.maxUsesPerPharmacy !== code.maxUsesPerPharmacy) && (
                          <div className="adm-offer-proposed">
                            {t('discountCodes.proposed')}:{' '}
                            <strong>
                              {u.maxUses ?? '∞'} / {u.maxUsesPerPharmacy ?? '∞'}
                            </strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge ${statusBadgeClass(code.displayStatus)}`}>
                          {t(`discountCodes.status.${code.displayStatus}`)}
                        </span>
                        {u && <div className="adm-table-sub">{t('discountCodes.updatePendingBadge')}</div>}
                        {code.rejectionNote && (
                          <div className="adm-table-sub">{t('common.rejectionReason', { reason: code.rejectionNote })}</div>
                        )}
                      </td>
                      <td>
                        <div className="adm-row-actions">
                          {isInReview(code) && (
                            <>
                              <button className="btn-approve" disabled={busyId === code.id} onClick={() => handleApprove(code)}>
                                {t('common.approve')}
                              </button>
                              <button className="btn-reject" disabled={busyId === code.id} onClick={() => handleReject(code)}>
                                {t('common.reject')}
                              </button>
                            </>
                          )}
                          {code.ownerRole === 'admin' && code.status === 'approved' && (
                            <button className="adm-row-action" onClick={() => setEditing(code)}>
                              {t('common.edit')}
                            </button>
                          )}
                          {isStoppable(code) && (
                            <button
                              className="adm-row-action adm-row-action-danger"
                              disabled={busyId === code.id}
                              onClick={() => handleStop(code)}
                            >
                              {t('discountCodes.stop')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <LoadMoreControl hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} pageSize={PAGE_SIZE} />
        </>
      )}

      {editing && (
        <DiscountCodeModal
          mode={editing === 'new' ? 'create' : 'edit'}
          code={editing === 'new' ? null : editing}
          searchPharmacies={searchPharmacies}
          isWarehouse={false}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onSubmit={(payload) =>
            editing === 'new'
              ? api.createAdminDiscountCode(payload)
              : api.updateAdminDiscountCode(editing.id, payload, editing.version)
          }
        />
      )}
    </div>
  );
}
