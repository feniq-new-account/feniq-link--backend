import { hasRolePermission } from '../utils/userPermissions';
import { useAuth } from '../auth/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { LoadMoreControl } from '../components/LoadMoreControl';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';
import { displayName } from '../utils/displayName';
import { formatSyp } from '../utils/currency';
import { CollectPaymentModal } from '../components/CollectPaymentModal';
import { useDeliveryCollections } from '../components/DeliveryCollections';
import { isEditable, mergeAdvancedOrders, nextStatusOf, rememberAdvanced, syncAdvancedWithRows } from './warehouseOrdersList';
import { formatBusinessDateTime } from '../utils/businessDate';
import { ConnectionStatus } from '../components/ConnectionStatus';

const PAGE_SIZE = 20;
// Three stages for the warehouse: new -> accepted -> on the way -> delivered,
// plus the pharmacy's cancellations.
const STATUS_VALUES = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
const ADVANCE_KEYS = {
  pending: 'orders.advancePending',
  confirmed: 'orders.advanceConfirmed',
  preparing: 'orders.advancePreparing',
  out_for_delivery: 'orders.advanceOutForDelivery',
};

export function WarehouseOrdersPage() {
  const { user } = useAuth();
  const canRecord = hasRolePermission(user, 'paymentRecord');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { collect } = useDeliveryCollections();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [actionError, setActionError] = useState(null);
  // The order whose "delivered" is asking "قبضت؟", and the result message.
  const [collecting, setCollecting] = useState(null);
  const [collectMessage, setCollectMessage] = useState(null);
  // Orders that arrived over the socket since the operator last acknowledged
  // them - the list itself is always refreshed, this is just the "look here"
  // cue so an arrival isn't missed while working another tab.
  const [newOrderCount, setNewOrderCount] = useState(0);
  // Orders advanced from this tab: they stay listed, in place, with their new
  // status and the next stage's button, until the tab changes
  // (warehouseOrdersList.js).
  const [advanced, setAdvanced] = useState(() => new Map());
  const [updatedAt, setUpdatedAt] = useState(null);

  const statusLabel = useCallback((status) => t(`orders.status${statusKeySuffix(status)}`), [t]);

  const fetchPage = useCallback(
    (cursor) =>
      api
        .warehouseOrders({ status: statusFilter || undefined, limit: PAGE_SIZE, after: cursor })
        .then((data) => {
          setUpdatedAt(Date.now());
          return { rows: data.orders, hasMore: data.pagination.hasMore, nextCursor: data.pagination.nextCursor };
        }),
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

  const orders = mergeAdvancedOrders(loadedOrders, advanced, Boolean(statusFilter && statusFilter !== 'pending'));

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
  const [busyOrders, setBusyOrders] = useState(new Set());
  const handleAdvance = async (order, currentStatus) => {
    if (pendingByOrder.current.has(order.id)) return false;
    const next = nextStatusOf(currentStatus);
    if (!next) return false;
    pendingByOrder.current.set(order.id, true);
    setBusyOrders((current) => new Set(current).add(order.id));
    setActionError(null);
    try {
      const data = await api.advanceOrderStatus(order.id, { expectedStatus: currentStatus, targetStatus: next });
      setAdvanced((current) => rememberAdvanced(current, order, data.order.status));
      return true;
    } catch (err) {
      await reset();
      setActionError(err.message);
      return false;
    } finally {
      pendingByOrder.current.delete(order.id);
      setBusyOrders((current) => { const next = new Set(current); next.delete(order.id); return next; });
    }
  };

  // "Delivered" asks "قبضت؟" first: all, part, or later. Closing the sheet
  // leaves the order on its way.
  const handleCollectChoice = async (collected) => {
    const order = collecting;
    setCollecting(null);
    setCollectMessage(null);
    try {
      await collect(order, collected, t('collect.note', { number: order.orderNumber }));
      setAdvanced((current) => rememberAdvanced(current, order, 'delivered'));
      if (collected > 0) setCollectMessage(t('collect.recorded', { amount: formatSyp(collected) }));
    } catch {
      setCollectMessage(t('collect.pendingNotice'));
    } finally { reset(); }
  };

  const openOrder = (order) => navigate(`/warehouse/orders/${order.id}`);
  // The edit form sits on the order's page; this opens it scrolled to it.
  const editOrder = (order) => navigate(`/warehouse/orders/${order.id}#edit`);

  // The row's actions: move it on, and - until it is sent - edit it.
  const renderActions = (order) => (
    <div className="wh-inline-actions">
    <div className="wh-order-actions">
      {ADVANCE_KEYS[order.status] && (
        <button
          disabled={busyOrders.has(order.id)}
          className={`wh-row-action wh-advance-to-${nextStatusOf(order.status)}`}
          onClick={(event) => {
            event.stopPropagation();
            if (order.status === 'out_for_delivery' && canRecord) setCollecting(order);
            else handleAdvance(order, order.status);
          }}
        >
          {t(ADVANCE_KEYS[order.status])}
        </button>
      )}
      {isEditable(order.status) && (
        <button
          type="button"
          className="wh-row-action wh-row-action-secondary"
          onClick={(event) => {
            event.stopPropagation();
            editOrder(order);
          }}
        >
          {t('orders.editOrder')}
        </button>
      )}
    </div>
      {collecting?.id === order.id && (
        <CollectPaymentModal
          orderNumber={collecting.orderNumber}
          totalSyp={collecting.finalPrice}
          onChoose={handleCollectChoice}
          onClose={() => setCollecting(null)}
        />
      )}
    </div>
  );

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
      <ConnectionStatus updatedAt={updatedAt} onRefresh={reset} busy={isLoading} />

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
      {collectMessage && <p className="hint">{collectMessage}</p>}


      {isLoading ? (
        <p className="hint">{t('common.loading')}</p>
      ) : orders.length === 0 ? (
        <p className="hint">{t('orders.noOrders')}</p>
      ) : (
        <>
          <div className="wh-card table-scroll wh-orders-table">
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
                  <tr key={order.id} onClick={() => openOrder(order)}>
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
                      {order.createdAt ? formatBusinessDateTime(order.createdAt) : ''}
                    </td>
                    <td>
                      <span className={`status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
                    </td>
                    <td>{renderActions(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* On a phone the table's last columns (status, actions) fell off
              the screen edge; there each order is a card instead. */}
          <div className="wh-order-cards">
            {orders.map((order) => (
              <div
                key={order.id}
                className="wh-card wh-order-card"
                role="button"
                tabIndex={0}
                onClick={() => openOrder(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.target === event.currentTarget) openOrder(order);
                }}
              >
                <div className="wh-order-card-head">
                  <span className="wh-num wh-table-order-num">
                    {t('orders.orderNumber', { number: order.orderNumber })}
                  </span>
                  <span className={`status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
                </div>
                <div className="wh-order-card-pharmacy">
                  {displayName(order.pharmacy?.nameEn, order.pharmacy?.nameAr)}
                  {order.pharmacy?.city && <span className="wh-table-sub"> · {order.pharmacy.city}</span>}
                </div>
                <div className="wh-order-card-meta">
                  <span className="wh-num wh-table-total">{formatSyp(order.finalPrice)}</span>
                  <span className="wh-table-sub">
                    {t('orders.itemCountColumn')}: <span className="wh-num">{order.items.length}</span>
                  </span>
                  <span className="wh-num wh-table-date">
                    {order.createdAt ? formatBusinessDateTime(order.createdAt) : ''}
                  </span>
                </div>
                {renderActions(order)}
              </div>
            ))}
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
