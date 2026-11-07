import { CashCustodyPanel } from '../components/CashCustodyPanel';
import { AdminCollectionControls } from '../components/AdminCollectionControls';
import { NumericInput } from '../components/NumericInput';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';
import {
  businessDateInputValue,
  formatBusinessDate,
  formatBusinessTime,
  startOfBusinessMonthInputValue,
} from '../utils/businessDate';
import { createIdempotencyKeys, PAYMENT_METHODS } from '../utils/payments';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';

const COLLECTIONS_PAGE_SIZE = 50;

// Money-Flow V2 - the platform's side of commission.
//
// The warehouse's own Settlement tab answers "what do I keep?"; this answers
// the platform's question, "who owes us, and have they paid?" - every
// warehouse at once, over one admin-chosen window.
//
// Two things it is deliberately NOT:
//
//  * not a second ledger. Commission is warehouse-to-platform; a LedgerAccount
//    is pharmacy-to-warehouse. Recording a collection here never touches a
//    pharmacy's balance.
//  * not a recomputation. Every figure below is server-computed by the same
//    settlement service the warehouse's tab uses, so the two can never tell
//    different stories about the same period.
//
// The date range is owned by this page and applies to the whole table AND to
// the detail view beneath it, so a warehouse's row and its breakdown always
// describe the same window.

// Outstanding is the one figure that can legitimately be negative: the
// platform owes the warehouse - its discount-code compensation is more than
// its commission, or it has handed over more than the window. Rendered as
// such rather than clamped to zero, because it is money the platform has to
// pay, not something to tidy away.
function OutstandingAmount({ amountSyp }) {
  const { t } = useTranslation();
  if (amountSyp == null) return <span>—</span>;
  if (amountSyp < 0) {
    return (
      <span className="adm-green" title={t('commission.platformOwesHint')}>
        {formatSyp(amountSyp)}
        <span className="adm-table-sub" style={{ display: 'block' }}>
          {t('commission.platformOwes')}
        </span>
      </span>
    );
  }
  return <span>{formatSyp(amountSyp)}</span>;
}

function StatCard({ label, value, hint, tone }) {
  return (
    <div className={`adm-stat-card${tone ? ` ${tone}` : ''}`}>
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value adm-num">{value}</div>
      {hint && <div className="adm-stat-hint">{hint}</div>}
    </div>
  );
}

// Records cash between the platform and a warehouse, either way: the
// warehouse paying its commission (a collection), or the platform paying the
// warehouse the discount-code compensation it owes it (a payout). The
// direction and amount are pre-filled from what is outstanding for the current
// window - positive: the warehouse owes; negative: the platform does - but
// stay editable: a partial payment is a normal thing, and the admin may be
// recording a round figure that was actually handed over.
//
// The period submitted is the window currently being viewed: that is what the
// admin was looking at when they decided how much was owed, so it is the
// honest thing to file the payment against.
export function RecordCollectionForm({ warehouseId, period, outstandingSyp, onSaved }) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState('from_warehouse');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [requestKeys] = useState(() => createIdempotencyKeys());

  const owedDirection = outstandingSyp < 0 ? 'to_warehouse' : 'from_warehouse';

  // Re-prefills whenever the warehouse or the window changes, so the field
  // always opens on the figure sitting in the row above it.
  useEffect(() => {
    setDirection(owedDirection);
    setAmount(outstandingSyp !== 0 ? String(Math.abs(outstandingSyp)) : '');
    setError(null);
  }, [warehouseId, outstandingSyp, owedDirection, period.from, period.to]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      setError(t('commission.amountPositive'));
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        warehouseId,
        periodFrom: period.from,
        periodTo: period.to,
        amountSyp: value,
        direction,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      };
      await requestKeys.submit({ operation: 'commission-cash', ...body }, async idempotencyKey => {
        await api.recordCommissionCollection({ ...body, idempotencyKey });
        await onSaved();
      });
      setReference('');
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="adm-detail-card">
      <h2 className="adm-detail-card-title">{t('commission.recordCollection')}</h2>
      <p className="adm-detail-card-hint">
        {t('commission.recordCollectionHint', {
          from: formatBusinessDate(period.from),
          to: formatBusinessDate(period.to),
        })}
      </p>
      <form onSubmit={handleSubmit} className="product-form">
        <label>
          {t('commission.direction')}
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="from_warehouse">{t('commission.direction_from_warehouse')}</option>
            <option value="to_warehouse">{t('commission.direction_to_warehouse')}</option>
          </select>
        </label>
        <label>
          {t('commission.amount')}
          <NumericInput
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          {t('debts.method')}
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`debts.method_${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('debts.referenceOptional')}
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t('debts.referencePlaceholder')}
          />
        </label>
        <label>
          {t('debts.noteOptional')}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('commission.notePlaceholder')}
          />
        </label>
        <div className="form-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={outstandingSyp === 0}
            onClick={() => {
              setDirection(owedDirection);
              setAmount(String(Math.abs(outstandingSyp)));
            }}
          >
            {t('commission.fullOutstanding')}
          </button>
          <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isSaving}>
            {isSaving
              ? t('common.saving')
              : direction === 'to_warehouse'
                ? t('commission.recordPayoutButton')
                : t('commission.recordCollectionButton')}
          </button>
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// A collection is corrected by reversing it, never by editing or deleting -
// same rule, and same modal shape, as reversing a pharmacy payment. The reason
// is mandatory here and again on the server.
export function ReverseCollectionModal({ collection, onClose, onConfirm }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);
  const [requestKeys] = useState(() => createIdempotencyKeys());

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError(t('commission.reverseReasonRequired'));
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await requestKeys.submit({ operation: 'commission-cash-reversal', collectionId: collection.id, reason: reason.trim() },
        idempotencyKey => onConfirm(reason.trim(), idempotencyKey));
    } catch (err) {
      setError(err.message);
      setIsBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{t('commission.reverseTitle')}</h2>
        <p className="hint">
          {t('commission.reverseExplain', { amount: formatSyp(collection.amountSyp) })}
        </p>
        <form onSubmit={handleSubmit} className="product-form">
          <label>
            {t('debts.reverseReason')}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('commission.reverseReasonPlaceholder')}
              autoFocus
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-reject" disabled={isBusy}>
              {isBusy ? t('common.saving') : t('commission.reverseButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Every collection ever recorded against this warehouse - not just the ones
// inside the current window. A reversed row stays, struck through with the
// reason that undid it, because the history is the point.
function CollectionHistory({ collections, onReverse }) {
  const { t } = useTranslation();

  if (collections.length === 0) {
    return (
      <div className="adm-detail-card">
        <h2 className="adm-detail-card-title">{t('commission.history')}</h2>
        <p className="hint">{t('commission.noCollections')}</p>
      </div>
    );
  }

  return (
    <div className="adm-card table-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th>{t('debts.date')}</th>
            <th>{t('commission.coversPeriod')}</th>
            <th className="adm-num">{t('commission.amount')}</th>
            <th>{t('commission.details')}</th>
            <th aria-label={t('debts.reverse')} />
          </tr>
        </thead>
        <tbody>
          {collections.map((collection) => {
            const isReversed = collection.status === 'reversed';
            const recordedAt = new Date(collection.recordedAt);
            return (
              <tr key={collection.id}>
                <td>
                  <div>{formatBusinessDate(recordedAt)}</div>
                  <div className="adm-table-sub">{formatBusinessTime(recordedAt)}</div>
                </td>
                <td className="adm-num">
                  {formatBusinessDate(collection.periodFrom)} &ndash;{' '}
                  {formatBusinessDate(collection.periodTo)}
                </td>
                <td className="adm-num">
                  <span
                    style={isReversed ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}
                  >
                    {formatSyp(collection.amountSyp)}
                  </span>
                </td>
                <td>
                  <div>{t(`commission.direction_${collection.direction ?? 'from_warehouse'}`)}</div>
                  <div className="adm-table-sub">{t(`debts.method_${collection.method}`)}</div>
                  {collection.reference && (
                    <div className="adm-table-sub adm-num">{collection.reference}</div>
                  )}
                  {collection.note && <div>{collection.note}</div>}
                  {isReversed && (
                    <div className="adm-table-sub">
                      {t('debts.reversedBecause', { reason: collection.reversalReason })}
                    </div>
                  )}
                </td>
                <td>
                  <div className="adm-row-actions">
                    {/* A reversal is final - there is nothing left to undo. */}
                    {!isReversed && (
                      <button
                        className="adm-row-action adm-row-action-danger"
                        onClick={() => onReverse(collection)}
                      >
                        {t('debts.reverse')}
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
  );
}

// One warehouse: the same figures as its row above, the per-order settlement
// breakdown behind them, the form that records a payment, and the history.
function WarehouseCommissionDetail({ warehouseId, from, to, onBack, onChanged }) {
  const { t, i18n } = useTranslation();
  // summary/orders/warehouse/period are not paginated - every fetchPage call
  // (the first load AND every "load more" of the collections history below)
  // returns the full current detail, so they are refreshed as a side effect
  // of that same request rather than fetched separately (same reasoning as
  // AdminOffersPage's reviewCount, which rides along with its own fetchPage).
  const [meta, setMeta] = useState(null);
  // The collection about to be reversed, held here so the modal is a sibling
  // of the table rather than a cell inside it.
  const [reversing, setReversing] = useState(null);

  const fetchPage = useCallback(
    (cursor) =>
      api.adminCommissionWarehouse(warehouseId, { from, to, limit: COLLECTIONS_PAGE_SIZE, after: cursor }).then((response) => {
        const { collections, pagination, ...rest } = response.detail;
        setMeta(rest);
        return { rows: collections, hasMore: pagination.hasMore, nextCursor: pagination.nextCursor };
      }),
    [warehouseId, from, to]
  );
  const {
    data: collections,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  } = usePaginatedData(fetchPage);

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, from, to]);

  // "Back" points toward where the list is - left in LTR, right in RTL.
  const backButton = (
    <button className="wh-detail-back" onClick={onBack}>
      <span aria-hidden="true">{i18n.language === 'ar' ? '→' : '←'}</span>{' '}
      {t('commission.backToList')}
    </button>
  );

  if (error) {
    return (
      <div>
        {backButton}
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (isLoading || !meta) {
    return (
      <div>
        {backButton}
        <p className="hint">{t('common.loading')}</p>
      </div>
    );
  }

  const { summary, orders, warehouse, period } = meta;

  // Both the row above and this view have to move when a collection is
  // recorded or reversed, so every mutation refreshes the two together.
  const reload = async () => {
    await reset({ throwOnError: true });
    await onChanged();
  };

  return (
    <div>
      {backButton}

      <div className="adm-page-head">
        <h1>{displayName(warehouse.nameEn, warehouse.nameAr)}</h1>
        {warehouse.phone && (
          <div className="adm-page-head-meta adm-num" dir="ltr">
            {warehouse.phone}
          </div>
        )}
      </div>

      <div className="adm-stats-grid">
        <StatCard
          label={t('commission.sales')}
          value={formatSyp(summary.salesSyp)}
          hint={t('settlement.salesHint', { count: summary.orderCount })}
          tone="adm-stat-navy"
        />
        <StatCard
          label={t('commission.returns')}
          value={formatSyp(summary.returnsSyp)}
          hint={t('commission.returnsHint')}
        />
        <StatCard
          label={t('commission.owed')}
          value={formatSyp(summary.commissionOwedSyp)}
          hint={t('commission.owedHint')}
          tone="adm-stat-info"
        />
        <StatCard
          label={t('commission.compensation')}
          value={formatSyp(summary.compensationOwedSyp ?? 0)}
          hint={t('commission.compensationHint')}
        />
        <StatCard
          label={t('commission.outstanding')}
          value={summary.outstandingSyp == null ? '—' : formatSyp(summary.outstandingSyp)}
          hint={t('commission.settledSoFar', {
            collected: formatSyp(summary.alreadyCollectedSyp),
            paidOut: formatSyp(summary.paidOutSyp ?? 0),
          })}
          tone={summary.outstandingSyp > 0 ? 'adm-stat-pending' : 'adm-stat-success'}
        />
      </div>

      <AdminCollectionControls warehouseId={warehouseId} />
      <CashCustodyPanel warehouseId={warehouseId} />
      {summary.heldByFeniqSyp !== undefined && <p>{t('cashCustody.heldCommission')}: {formatSyp(summary.heldByFeniqSyp)}</p>}
      {summary.cashDueScope === 'selected_period_bounded_by_current_cash' && <p>{t('cashCustody.periodMovement')}: {formatSyp(summary.periodOutstandingSyp)}</p>}
      {summary.currentCashOutstandingSyp != null && <p>{t('cashCustody.currentCommissionCash')}: {formatSyp(summary.currentCashOutstandingSyp)}</p>}
      {summary.custodyUnreconciled && <p role="alert">{t('cashCustody.unverifiedCommission')}</p>}
      <div className="adm-detail-grid">
        <div>
          <div className="adm-card-head">
            <span>{t('commission.ordersBreakdown')}</span>
          </div>
          {orders.length === 0 ? (
            <div className="adm-empty-state">
              <div className="adm-empty-state-title">{t('settlement.noOrders')}</div>
            </div>
          ) : (
            <div className="adm-card table-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t('settlement.invoice')}</th>
                    <th>{t('settlement.deliveredOn')}</th>
                    <th className="adm-num">{t('commission.sales')}</th>
                    <th className="adm-num">{t('commission.returns')}</th>
                    <th className="adm-num">{t('commission.owed')}</th>
                    <th className="adm-num">{t('commission.compensation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.orderId}>
                      <td>
                        <div>
                          {order.invoiceNumber != null
                            ? t('settlement.invoiceNumber', { number: order.invoiceNumber })
                            : '—'}
                        </div>
                        <div className="adm-table-sub">
                          {t('orders.orderNumber', { number: order.orderNumber })}
                        </div>
                      </td>
                      <td className="adm-num">
                        {order.deliveredAt
                          ? formatBusinessDate(order.deliveredAt)
                          : '—'}
                      </td>
                      <td className="adm-num">{formatSyp(order.salesSyp)}</td>
                      <td className="adm-num">
                        {order.creditedSyp > 0 ? `- ${formatSyp(order.creditedSyp)}` : '—'}
                      </td>
                      <td className="adm-num">{formatSyp(order.netCommissionSyp)}</td>
                      <td className="adm-num">
                        {order.platformCompensationSyp > 0 ? (
                          <>
                            {formatSyp(order.netCompensationSyp)}
                            <div className="adm-table-sub">
                              {t('commission.compensationForCode', { code: order.discountCode })}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="adm-card-head" style={{ marginTop: 24 }}>
            <span>{t('commission.history')}</span>
          </div>
          <CollectionHistory collections={collections} onReverse={setReversing} />
          {collections.length > 0 && (
            <LoadMoreControl
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
              pageSize={COLLECTIONS_PAGE_SIZE}
            />
          )}
        </div>

        <div>
          {summary.outstandingSyp != null && <RecordCollectionForm
            warehouseId={warehouseId}
            period={period}
            outstandingSyp={summary.outstandingSyp}
            onSaved={reload}
          />}
        </div>
      </div>

      {reversing && (
        <ReverseCollectionModal
          collection={reversing}
          onClose={() => setReversing(null)}
          onConfirm={async (reason, idempotencyKey) => {
            await api.reverseCommissionCollection(reversing.id, { reason, idempotencyKey });
            setReversing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

export function AdminCommissionPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfBusinessMonthInputValue());
  const [to, setTo] = useState(businessDateInputValue());
  const [overview, setOverview] = useState(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ throwOnError = false } = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.adminCommissionOverview({ from, to });
      setOverview(response.overview);
    } catch (err) {
      setError(err.message);
      if (throwOnError) throw err;
    } finally {
      setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const rangeFilters = (
    <div className="adm-filters-row">
      <label className="adm-account-type-label">
        {t('settlement.from')}
        <input
          className="adm-filter-select"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label className="adm-account-type-label">
        {t('settlement.to')}
        <input
          className="adm-filter-select"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
    </div>
  );

  if (selectedWarehouseId) {
    return (
      <div>
        {rangeFilters}
        <WarehouseCommissionDetail
          warehouseId={selectedWarehouseId}
          from={from}
          to={to}
          onBack={() => setSelectedWarehouseId(null)}
          onChanged={() => load({ throwOnError: true })}
        />
      </div>
    );
  }

  const totals = overview?.totals;

  return (
    <div>
      <div className="adm-page-head">
        <h1>{t('nav.commission')}</h1>
      </div>

      {rangeFilters}

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : !overview ? null : (
        <>
          <div className="adm-stats-grid">
            <StatCard
              label={t('commission.sales')}
              value={formatSyp(totals.salesSyp)}
              hint={t('commission.salesHint')}
              tone="adm-stat-navy"
            />
            <StatCard
              label={t('commission.returns')}
              value={formatSyp(totals.returnsSyp)}
              hint={t('commission.returnsHint')}
            />
            <StatCard
              label={t('commission.owed')}
              value={formatSyp(totals.commissionOwedSyp)}
              hint={t('commission.owedHint')}
              tone="adm-stat-info"
            />
            <StatCard
              label={t('commission.compensation')}
              value={formatSyp(totals.compensationOwedSyp ?? 0)}
              hint={t('commission.compensationHint')}
            />
            <StatCard
              label={t('commission.outstanding')}
              value={totals.outstandingSyp == null ? '—' : formatSyp(totals.outstandingSyp)}
              hint={t('commission.settledSoFar', {
                collected: formatSyp(totals.alreadyCollectedSyp),
                paidOut: formatSyp(totals.paidOutSyp ?? 0),
              })}
              tone={totals.outstandingSyp > 0 ? 'adm-stat-pending' : 'adm-stat-success'}
            />
          </div>

          <div className="adm-card table-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>{t('commission.warehouse')}</th>
                  <th className="adm-num">{t('commission.sales')}</th>
                  <th className="adm-num">{t('commission.returns')}</th>
                  <th className="adm-num">{t('commission.owed')}</th>
                  <th className="adm-num">{t('commission.compensation')}</th>
                  <th className="adm-num">{t('commission.collected')}</th>
                  <th className="adm-num">{t('commission.paidOut')}</th>
                  <th className="adm-num">{t('commission.outstanding')}</th>
                  <th className="adm-num">{t('cashCustody.auditedNet')}</th>
                  <th className="adm-num">{t('cashCustody.cashInCustodySyp')}</th>
                </tr>
              </thead>
              <tbody>
                {/* Server-sorted by outstanding, descending - the order an
                    admin actually works through. Deliberately the only order:
                    no client-side re-sorting, so what is read here is what the
                    server computed. */}
                {overview.warehouses.map((row) => (
                  <tr
                    key={row.warehouseId}
                    className="clickable-row"
                    onClick={() => setSelectedWarehouseId(row.warehouseId)}
                  >
                    <td>
                      <div>{displayName(row.nameEn, row.nameAr)}</div>
                      {row.phone && (
                        <div className="adm-table-sub adm-num" dir="ltr">
                          {row.phone}
                        </div>
                      )}
                    </td>
                    <td className="adm-num">{formatSyp(row.salesSyp)}</td>
                    <td className="adm-num">
                      {row.returnsSyp > 0 ? `- ${formatSyp(row.returnsSyp)}` : '—'}
                    </td>
                    <td className="adm-num">{formatSyp(row.commissionOwedSyp)}</td>
                    <td className="adm-num">
                      {row.compensationOwedSyp > 0 ? formatSyp(row.compensationOwedSyp) : '—'}
                    </td>
                    <td className="adm-num">
                      {row.alreadyCollectedSyp > 0 ? formatSyp(row.alreadyCollectedSyp) : '—'}
                    </td>
                    <td className="adm-num">{row.paidOutSyp > 0 ? formatSyp(row.paidOutSyp) : '—'}</td>
                    <td className="adm-num">
                      <OutstandingAmount amountSyp={row.outstandingSyp} />
                      {row.cashDueScope === 'selected_period_bounded_by_current_cash' && <small>{t('cashCustody.periodMovement')}: {formatSyp(row.periodOutstandingSyp)} · {t('cashCustody.currentCommissionCash')}: {row.currentCashOutstandingSyp == null ? '—' : formatSyp(row.currentCashOutstandingSyp)}</small>}
                    </td>
                    <td className="adm-num">{row.cashCustody?.netWarehouseDueSyp == null ? '—' : formatSyp(row.cashCustody.netWarehouseDueSyp)}
                      {row.cashCustody && <small>{formatBusinessDateTime(row.cashCustody.asOf)} · {t('cashCustody.overdueCount')}: {row.cashCustody.overdueCount}</small>}
                    </td>
                    <td className="adm-num">{row.cashCustody?.cashInCustodySyp == null ? '—' : formatSyp(row.cashCustody.cashInCustodySyp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="adm-table-hint">{t('commission.clickRowHint')}</p>
        </>
      )}
    </div>
  );
}
