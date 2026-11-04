import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const Context = createContext({ subscription: null, loading: false, hasFeature: () => false, refresh: () => {}, applyFeatures: () => {} });

export function WarehouseSubscriptionProvider({ children }) {
  const { t } = useTranslation();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  const applyFeatures = useCallback(features => setSubscription(value => value ? { ...value, features } : value), []);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    api.getWarehouseSubscription().then((result) => { if (live) setSubscription(result); })
      .catch((err) => { if (live) setError(err.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [attempt]);
  const hasFeature = (name) => subscription?.features?.[name] === true;
  return <Context.Provider value={{ subscription, loading, hasFeature, refresh, applyFeatures }}>
    {error && <div className="warehouse-subscription-notice" role="status">
      <p>{t('warehouseAccess.statusFailed')}</p>
      <button type="button" className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>{t('common.retry')}</button>
    </div>}
    {subscription && ['freemium', 'expired', 'paused', 'grace'].includes(subscription.state) &&
      <div className="warehouse-subscription-notice" role="status">
        {t(`warehouseAccess.states.${subscription.state}`)} — {t('warehouseAccess.accessNotice')}
      </div>}
    {children}
  </Context.Provider>;
}
export function useWarehouseSubscription() { return useContext(Context); }
