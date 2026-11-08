import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { REALTIME_EVENTS, useRealtimeSync } from '../realtime/useRealtimeSync';
import { offerValueLabel } from '../utils/offerValue';
import { AdminOperationsOverview } from './AdminOperationsOverview';
import { FeatureControlCenter } from '../components/FeatureControlCenter';

function accountName(account) {
  return account.pharmacy?.nameEn || account.warehouse?.nameEn || account.user.name;
}

function accountCity(account) {
  const profile = account.pharmacy || account.warehouse;
  return profile?.city ?? '-';
}

// Section 13c: an overview landing screen built entirely from data the other
// admin pages already fetch (pending accounts/offers/banners, the products
// list, the exchange rate) - no new endpoint, this just aggregates and
// summarizes what's already there. There's no cross-warehouse "recent
// orders" endpoint for the admin role, so unlike the mockup this shows
// recent pending offers as the second list instead - still "things that
// just happened and may need a decision," using only data that already
// exists.
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [pendingBannersCount, setPendingBannersCount] = useState(0);
  const [productsCount, setProductsCount] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const [accountsData, offersData, bannersData, productsCountData, rateData] = await Promise.all([
        api.pendingAccounts(),
        api.pendingOffers(),
        api.adminBanners('pending'),
        api.adminProductsCount(),
        api.adminExchangeRate(),
      ]);
      if (request !== requestRef.current) return;
      if (!Array.isArray(accountsData.accounts) || !Array.isArray(offersData.offers) ||
          !Array.isArray(bannersData.banners) || !Number.isSafeInteger(productsCountData.count) ||
          productsCountData.count < 0) throw new Error(t('adminUx.invalidDashboardData'));
      setAccounts(accountsData.accounts);
      setOffers(offersData.offers);
      setPendingBannersCount(bannersData.banners.length);
      setProductsCount(productsCountData.count);
      setExchangeRate(rateData.exchangeRate);
    } catch (err) {
      if (request === requestRef.current) setError(err.message || t('adminUx.dashboardLoadFailed'));
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  // Realtime: every stat card and both recent-lists on this screen are
  // derived from the three admin queues, so any of these six events makes the
  // whole aggregate stale. `load()` is the page's own existing refetch - the
  // five parallel REST calls stay the source of truth, the socket only decides
  // when to re-run them. RealtimeClient already collapses a burst into one
  // call and fires this again after a reconnect.
  useRealtimeSync(
    [
      REALTIME_EVENTS.ACCOUNT_PENDING,
      REALTIME_EVENTS.ACCOUNT_STATUS_UPDATED,
      REALTIME_EVENTS.OFFER_PENDING,
      REALTIME_EVENTS.OFFER_STATUS_UPDATED,
      REALTIME_EVENTS.BANNER_PENDING,
      REALTIME_EVENTS.BANNER_STATUS_UPDATED,
    ],
    load,
    // Six events, one aggregate: every card here comes from the three admin
    // queues, so a burst across them is one load(), not one per event name.
    { grouped: true }
  );

  const stats = [
    {
      key: 'pendingAccounts',
      label: t('nav.pendingAccounts'),
      value: accounts.length,
      to: '/admin/accounts',
      tone: 'pending',
    },
    { key: 'pendingOffers', label: t('nav.offers'), value: offers.length, to: '/admin/offers', tone: 'info' },
    {
      key: 'pendingBanners',
      // Banners are now the "general" half of the merged Advertisements tab.
      label: t('nav.advertisementsGeneral'),
      value: pendingBannersCount,
      to: '/admin/advertisements/general',
      tone: 'pending',
    },
    { key: 'products', label: t('nav.products'), value: productsCount, to: '/admin/products', tone: 'navy' },
  ];

  return (
    <div className="adm-dashboard-page">
      <header className="adm-dashboard-hero">
        <div>
          <p className="adm-dashboard-eyebrow">{t('adminUx.commandCenter')}</p>
          <h1>{t('nav.dashboard')}</h1>
          <p className="adm-dashboard-intro">{t('adminUx.dashboardSubtitle')}</p>
        </div>
        <button type="button" className="adm-dashboard-refresh" onClick={load}
          disabled={isLoading} aria-label={t('adminUx.refreshDashboard')}>
          <span aria-hidden="true">↻</span> {t('adminUx.refreshDashboard')}
        </button>
      </header>

      <nav className="adm-dashboard-shortcuts" aria-label={t('adminUx.quickNavigation')}>
        <Link to="/admin/accounts">{t('nav.accounts')}</Link>
        <Link to="/admin/catalog-requests">{t('nav.catalogRequests')}</Link>
        <Link to="/admin/commission">{t('nav.commission')}</Link>
        <Link to="/admin/features">{t('featureControl.title')}</Link>
      </nav>

      {error && <section className="adm-dashboard-error" role="alert">
        <strong>{t('adminUx.dashboardLoadFailed')}</strong>
        <p>{error}</p>
        <button type="button" className="adm-dashboard-retry" onClick={load}>
          {t('common.retry')}
        </button>
      </section>}

      {isLoading && <div className="adm-dashboard-loading" role="status">
        <span className="adm-dashboard-spinner" aria-hidden="true" />
        {t('common.loading')}
      </div>}

      {!isLoading && !error && <main className="adm-dashboard-live">
        <section className="adm-dashboard-section" aria-labelledby="admin-overview-title">
          <div className="adm-dashboard-section-heading">
            <div>
              <h2 id="admin-overview-title">{t('adminUx.pendingTasks')}</h2>
              <p>{t('adminUx.pendingTasksHint')}</p>
            </div>
          </div>
          <div className="adm-stats-grid">
            {stats.map((item) => (
              <Link to={item.to} key={item.key} className={'adm-stat-card adm-stat-' + item.tone}>
                <span className="adm-stat-label">{item.label}</span>
                <strong className="adm-stat-value adm-num">{item.value}</strong>
                <span className="adm-stat-hint">{t('dashboard.viewAll')} <span aria-hidden="true">›</span></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="adm-dashboard-section" aria-labelledby="admin-queues-title">
          <div className="adm-dashboard-section-heading">
            <div>
              <h2 id="admin-queues-title">{t('adminUx.recentQueues')}</h2>
              <p>{t('adminUx.queueHint')}</p>
            </div>
          </div>
          <div className="adm-dashboard-columns">
            <div className="adm-card">
              <div className="adm-card-head">
                <span>{t('dashboard.recentAccountsTitle')}</span>
                <Link to="/admin/accounts">{t('dashboard.viewAll')}</Link>
              </div>
              {accounts.length === 0
                ? <p className="adm-dashboard-empty">{t('admin.pendingAccounts.noAccounts')}</p>
                : accounts.slice(0, 5).map((account) => (
                  <div className="adm-list-row" key={account.user.id}>
                    <div className="adm-list-row-main">
                      <div className="adm-list-row-title">{accountName(account)}</div>
                      <div className="adm-list-row-sub">{account.user.role} &middot; {accountCity(account)}</div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="adm-card">
              <div className="adm-card-head">
                <span>{t('dashboard.recentOffersTitle')}</span>
                <Link to="/admin/offers">{t('dashboard.viewAll')}</Link>
              </div>
              {offers.length === 0
                ? <p className="adm-dashboard-empty">{t('offers.admin.noOffers')}</p>
                : offers.slice(0, 5).map((offer) => (
                  <div className="adm-list-row" key={offer.id}>
                    <div className="adm-list-row-main">
                      <div className="adm-list-row-title">{offer.titleEn || offer.titleAr}</div>
                      <div className="adm-list-row-sub">{offer.warehouseNameEn || offer.warehouseNameAr}</div>
                    </div>
                    <div className="adm-list-row-end adm-num">
                      {offer.offerType === 'bonus' ? offerValueLabel(offer, t)
                        : t('offers.percentOff', { percent: offer.discountPercentage })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {exchangeRate?.usdToSyp != null && (
          <div className="adm-dashboard-fx">
            <span>{t('admin.exchangeRate.title')}</span>
            <strong className="adm-num">
              {t('admin.exchangeRate.rateValue', { rate: exchangeRate.usdToSyp })}
            </strong>
            <Link to="/admin/exchange-rate">{t('dashboard.viewAll')}</Link>
          </div>
        )}
      </main>}

      <section className="adm-dashboard-tools" aria-labelledby="admin-tools-title">
        <div className="adm-dashboard-section-heading">
          <div>
            <h2 id="admin-tools-title">{t('adminUx.platformTools')}</h2>
            <p>{t('adminUx.platformToolsHint')}</p>
          </div>
        </div>
        <AdminOperationsOverview />
        <FeatureControlCenter quickOnly />
      </section>
    </div>
  );
}
