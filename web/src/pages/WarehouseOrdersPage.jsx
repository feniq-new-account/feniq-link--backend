import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';
import { displayName } from '../utils/displayName';
import { formatSyp } from '../utils/currency';
import { mergeAdvancedOrders, nextStatusOf, rememberAdvanced, syncAdvancedWithRows } from './warehouseOrdersList';

const PAGE_SIZE = 20;
const STATUS_VALUES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
const ADVANCE_KEYS = {
  pending: 'orders.advancePending',
  confirmed: 'orders.advanceConfirmed',
  preparing: 'orders.advancePreparing',
  out_for_delivery: 'orders.advanceOutForDelivery',
};

export function WarehouseOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [actionError, setActionError] = useState(null);
  // Orders that arrived over the socket since the operator last acknowledged
  // them - the list itself is always refreshed, this is just the "look here"
  // cue so an arrival isn't missed while working another tab.
  const [newOrderCount, setNewOrderCount] = useState(0);
  // Orders advanced from this tab: they stay listed, in place, with their new
  // status and the next stage's button, until the tab changes
  // (warehouseOrdersList.js).
  const [advanced, setAdvanced] = useState(() => new Map());

  const statusLabel = useCallback((status) => t(`orders.status${statusKeySuffix(status)}`), [t]);

  const fetchPage = useCallback(
    (cursor) =>
      api
        .warehouseOrders({ status: statusFilter || undefined, limit: PAGE_SIZE, after: cursor })
        .then((data) => ({
          rows: data.orders,
          hasMore: data.pagination.hasMore,
          nextCursor: data.pagination.nextCursor,
        })),
    [statusFilter]
  );

  const { data: loadedOrders, isLoading, isLoadingMore, hasMore, error, loadMore, reset } =
    usePaginatedData(fetchPage);

  // "Pending" (the fulfillment queue) and "All" (a chronological history:
  // first/oldest order at the top, most recent at the bottom) both render the
  // server's own page order as-is, which is already oldest-first (orderNumber
  // ascending - the codebase's chronological ordering). Every other status
  // tab flips that to newest-first. Applied to everything loaded so far, so it
  // stays correct as more pages come in via "Load more".
  useEffect(() => {
    setAdvanced((current) => syncAdvancedWithRows(current, loadedOrders));
  }, [loadedOrders]);

  const listed = mergeAdvancedOrders(loadedOrders, advanced);
  const orders = statusFilter === 'pending' || statusFilter === '' ? listed : listed.slice().reverse();

  useEffect(() => {
    setAdvanced(new Map());
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Realtime: the socket only tells us *that* something changed - the list is
  // then re-read through the same paginated endpoint used on mount, so what
  // renders is always the server's own answer. Rapid bursts are already
  // coalesced into one call by RealtimeClient, and a reconnect fires this too
  // (events may have been missed while the socket was down).
  //
  // A new order that arrives while the operator is on another tab would
  // otherwise vanish from view, so it's also surfaced as a dismissable pill.
  useRealtimeSync(
    [
      REALTIME_EVENTS.ORDER_CREATED,
      REALTIME_EVENTS.ORDER_CANCELLED,
      REALTIME_EVENTS.ORDER_STATUS_UPDATED,
    ],
    (payload, event, coalescedCount) => {
      if (event === REALTIME_EVENTS.ORDER_CREATED) {
        // coalescedCount, not 1: several orders arriving inside one coalesce
        // window are a single refetch but still several orders to announce.
        setNewOrderCount((count) => count + (coalescedCount || 1));
      }
      reset();
    }
  );

  // Each click moves the order on at once on screen (the next stage's button
  // is right there), and the request follows in the background. Clicks on
  // the same order are sent one after another, so a fast double click is two
  // stages, in order. A refused step puts the order back where the server
  // says it is.
  const pendingByOrder = useRef(new Map());
  const handleAdvance = (order, currentStatus) => {
    const next = nextStatusOf(currentStatus);
    if (!next) return;
    setActionError(null);
    setAdvanced((current) => rememberAdvanced(current, order, next));
    const previous = pendingByOrder.current.get(order.id) ?? Promise.resolve();
    const request = previous
      .then(() => api.advanceOrderStatus(order.id))
      .catch((err) => {
        setActionError(err.message);
        setAdvanced((current) => rememberAdvanced(current, order, currentStatus));
        reset();
        throw err;
      });
    pendingByOrder.current.set(order.id, request.catch(() => {}));
  };

  const statusTabs = [{ value: '', label: t('orders.tabAll') }, ...STATUS_VALUES.map((value) => ({
    value,
    label: statusLabel(value),
  }))];

  return (
    <div>
      <div className="wh-page-head">
        <h1>{t('nav.orders')}</h1>
        <div className="wh-page-head-meta">{t('orders.resultsCount', { count: orders.length })}</div>
      </div>

      <div className="wh-pills">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            className={`wh-pill${statusFilter === tab.value ? ' active' : ''}`}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {newOrderCount > 0 && (
        <button
          type="button"
          className="wh-realtime-pill"
          onClick={() => {
            setNewOrderCount(0);
            setStatusFilter('pending');
            reset();
          }}
        >
          {t('orders.newOrdersArrived', { count: newOrderCount })}
        </button>
      )}

      {(error || actionError) && <p className="error-text">{error || actionError}</p>}

      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : orders.length === 0 ? (
        <p className="hint">{t('orders.noOrders')}</p>
      ) : (
        <>
          <div className="wh-card table-scroll">
            <table className="wh-table">
              <thead>
                <tr>
                  <th>{t('orders.orderNumberColumn')}</th>
                  <th>{t('orderDetail.pharmacy')}</th>
                  <th>{t('orders.itemCountColumn')}</th>
                  <th>{t('orderDetail.finalPriceColumn')}</th>
                  <th>{t('debts.date')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('orders.actionColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} onClick={() => navigate(`/warehouse/orders/${order.id}`)}>
                    <td>
                      <span className="wh-num wh-table-order-num">
                        {t('orders.orderNumber', { number: order.orderNumber })}
                      </span>
                    </td>
                    <td>
                      {displayName(order.pharmacy?.nameEn, order.pharmacy?.nameAr)}
                      <div className="wh-table-sub">{order.pharmacy?.city}</div>
                    </td>
                    <td className="wh-num">{order.items.length}</td>
                    <td className="wh-num wh-table-total">{formatSyp(order.finalPrice)}</td>
                    <td className="wh-num wh-table-date">
                      {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                    </td>
                    <td>
                      <span className={`status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
                    </td>
                    <td>
                      {ADVANCE_KEYS[order.status] && (
                        <button
                          className={`wh-row-action wh-advance-to-${nextStatusOf(order.status)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleAdvance(order, order.status);
                          }}
                        >
                          {t(ADVANCE_KEYS[order.status])}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="wh-table-hint">{t('orders.clickRowHint')}</p>
          <LoadMoreControl
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}

function statusKeySuffix(status) {
  return status
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}
