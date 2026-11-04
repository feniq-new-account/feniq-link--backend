import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { createDeliveryCollectionStore } from '../utils/deliveryCollection';
import { formatSyp } from '../utils/currency';

const Context = createContext(null);

export function DeliveryCollectionsProvider({ children }) {
  const { user } = useAuth();
  const [store] = useState(() => createDeliveryCollectionStore(user.id));
  const [pending, setPending] = useState(store.list);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => store.subscribe(setPending), [store]);
  const retry = async (item) => {
    setBusy(true);
    setError(null);
    try { await store.run(api, item); }
    catch (err) { setError(err.message); throw err; }
    finally { setBusy(false); }
  };
  const collect = (order, amount, note) => retry(store.prepare(order, amount, note));
  return <Context.Provider value={{ pending, busy, error, retry, collect }}>{children}</Context.Provider>;
}

export function useDeliveryCollections() { return useContext(Context); }

export function DeliveryCollectionsNotice() {
  const { t } = useTranslation();
  const { pending, busy, error, retry } = useDeliveryCollections();
  if (!pending.length) return null;
  return <div className="wh-card" role="status">
    <p>{t('collect.pendingNotice')}</p>
    {pending.map((item) => <div key={item.orderId}>
      <span>{t(item.phase === 'delivery' ? 'collect.pendingDelivery' : 'collect.pendingPayment', { number: item.orderNumber, amount: formatSyp(item.amountSyp) })}</span>{' '}
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => retry(item).catch(() => {})}>{t('common.retry')}</button>
    </div>)}
    {error && <p className="error-text">{error}</p>}
  </div>;
}
