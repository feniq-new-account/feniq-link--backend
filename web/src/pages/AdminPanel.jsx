import { AdminAnalyticsPage } from './AdminAnalyticsPage';
import { AdminVisitVerificationPage } from './AdminVisitVerificationPage';
import { AdminAppReleasePage } from './AdminAppReleasePage';
import { AdminMaintenancePage } from './AdminMaintenancePage';
import { AdminWarehouseAccessPage } from './AdminWarehouseAccessPage';
import { FeatureControlCenter } from '../components/FeatureControlCenter';
import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isFeatureShown } from '../config/features';
import { useAuth } from '../auth/AuthContext';
import { LanguageToggle } from '../components/LanguageToggle';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { NavBadge } from '../components/NavBadge';
import { useUnreadBadges } from '../realtime/UnreadBadgesProvider';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AccountsPage } from './AccountsPage';
import { AdminRegistrationPage } from './AdminRegistrationPage';
import { AdminDistributionTripsPage } from './AdminDistributionTripsPage';
import { AdminPharmacyLicencesPage } from './AdminPharmacyLicencesPage';
import { AdminOffersPage } from './AdminOffersPage';
import { AdminDiscountCodesPage } from './AdminDiscountCodesPage';
import { AdminAdvertisementsPage } from './AdminAdvertisementsPage';
import { AdminProductsPage } from './AdminProductsPage';
import { AdminCatalogPage } from './AdminCatalogPage';
import { AdminCatalogRequestsPage } from './AdminCatalogRequestsPage';
import { AdminDuplicatesPage } from './AdminDuplicatesPage';
import { AdminManufacturersPage } from './AdminManufacturersPage';
import { AdminCategoriesPage } from './AdminCategoriesPage';
import { AdminBannersPage } from './AdminBannersPage';
import { AdminCommissionPage } from './AdminCommissionPage';
import { AdminExchangeRatePage } from './AdminExchangeRatePage';
import { AdminNotificationsPage } from './AdminNotificationsPage';
import { AdminComplaintsPage } from './AdminComplaintsPage';
import { AdminComplaintDetailPage } from './AdminComplaintDetailPage';
import { useStackedTableLabels } from '../hooks/useStackedTableLabels';
import './AdminUX.css';

function navLinkClassName({ isActive }) {
  return `adm-nav-link${isActive ? ' active' : ''}`;
}

// Section 13c: the admin side of the shared React panel - same real-routes
// sidebar shell as the warehouse side (Feniq Design import), under its own
// ".admin-shell" scope in index.css so restyling this can't touch
// WarehousePanel.jsx's look, same guarantee in reverse.
export function AdminPanel() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // Per-tab "new since you last looked" counts - see realtime/unreadBadges.js.
  const { countUnder, total: unreadTotal } = useUnreadBadges();

  // Keep the exact existing routes and role/feature rules. Groups are a
  // presentation affordance, not a permission or endpoint change.
  const SECTIONS = [
    { key: 'overview', tabs: [
      { path: '/admin/dashboard', label: t('nav.dashboard') },
      { path: '/admin/analytics', label: t('analytics.title') },
    ] },
    { key: 'operations', tabs: [
      { path: '/admin/accounts', label: t('nav.accounts') },
      { path: '/admin/registration', label: t('nav.registration') },
      { path: '/admin/pharmacy-licences', label: t('nav.pharmacyLicences') },
      { path: '/admin/warehouse-access', label: t('warehouseAccess.title') },
      { path: '/admin/visit-verification', label: t('visitVerification.title') },
      { path: '/admin/distribution', label: t('nav.distributionTrips') },
      { path: '/admin/notifications', label: t('nav.notifications') },
      { path: '/admin/complaints', label: t('nav.complaints') },
    ] },
    { key: 'promotion', tabs: [
      { path: '/admin/offers', label: t('nav.offers') },
      { path: '/admin/discount-codes', label: t('nav.discountCodes'), feature: 'discountCodes' },
      { path: '/admin/advertisements', label: t('nav.advertisements') },
    ] },
    { key: 'catalog', tabs: [
      { path: '/admin/products', label: t('nav.products') },
      { path: '/admin/catalog', label: t('nav.centralCatalog') },
      { path: '/admin/catalog-requests', label: t('nav.catalogRequests') },
      { path: '/admin/manufacturers', label: t('nav.manufacturers') },
      { path: '/admin/categories', label: t('nav.categories') },
    ] },
    { key: 'finance', tabs: [
      { path: '/admin/commission', label: t('nav.commission') },
      { path: '/admin/exchange-rate', label: t('nav.exchangeRate') },
    ] },
    { key: 'system', tabs: [
      { path: '/admin/features', label: t('featureControl.title') },
      { path: '/admin/app-release', label: t('appRelease.title') },
      { path: '/admin/maintenance', label: t('maintenance.title') },
    ] },
  ];

  const { pathname } = useLocation();
  const [navigationSearch, setNavigationSearch] = useState('');
  const normalizedSearch = navigationSearch.trim().toLocaleLowerCase();
  const visibleSections = SECTIONS
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((tab) =>
        isFeatureShown(tab.feature) &&
        (!normalizedSearch || (tab.label + ' ' + t('adminUx.sections.' + section.key))
          .toLocaleLowerCase().includes(normalizedSearch))),
    }))
    .filter((section) => section.tabs.length > 0);
  const currentTab = SECTIONS.flatMap((section) => section.tabs)
    .find((tab) => pathname === tab.path || pathname.startsWith(tab.path + '/'));
  const activePageTitle = currentTab?.label || t('nav.dashboard');

  // The mobile drawer closes on browser back, programmatic navigation, and
  // escape, not only when a sidebar link is clicked.
  useEffect(() => { setIsSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  // Closing on every route change covers both a tab click and any in-page
  // "back" navigation - anything that changes the URL while the mobile
  // drawer happens to be open.
  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setNavigationSearch('');
  };
  // Phone-width tables become cards whose cells name their column.
  const shellRef = useRef(null);
  useStackedTableLabels(shellRef);

  return (
    <div className="admin-shell" ref={shellRef}>
      <div
        className={`adm-sidebar-backdrop${isSidebarOpen ? ' adm-sidebar-open' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />
      <aside id="admin-sidebar-navigation" aria-label={t('adminUx.navigation')} className={`adm-sidebar${isSidebarOpen ? ' adm-sidebar-open' : ''}`}>
        <div className="adm-sidebar-header">
          <div className="adm-brand-lockup">
            <img className="adm-sidebar-logo" src="/images/feniq-mark-dark.png" alt={t('nav.brandName')} />
            <div>
              <div className="adm-sidebar-brand">{t('nav.brandName')}</div>
              <div className="adm-sidebar-subtitle">{t('nav.adminTitle')}</div>
            </div>
            <button type="button" className="adm-close-nav" aria-label={t('adminUx.closeNavigation')} onClick={closeSidebar}>×</button>
          </div>
          <label className="adm-nav-search-label" htmlFor="admin-nav-search">{t('adminUx.searchMenu')}</label>
          <input id="admin-nav-search" className="adm-nav-search" type="search" autoComplete="off"
            value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)}
            placeholder={t('adminUx.searchPlaceholder')} />
        </div>
        <nav className="adm-nav" aria-label={t('adminUx.navigation')}>
          {visibleSections.map((section) => (
            <section key={section.key} className="adm-nav-section" aria-label={t('adminUx.sections.' + section.key)}>
              <h2 className="adm-nav-section-title">{t('adminUx.sections.' + section.key)}</h2>
              {section.tabs.map((tab) => (
                <NavLink key={tab.path} to={tab.path} className={navLinkClassName} onClick={closeSidebar}>
                  {tab.label}
                  <NavBadge count={countUnder(tab.path)} />
                </NavLink>
              ))}
            </section>
          ))}
          {!visibleSections.length && <p className="adm-nav-empty" role="status">{t('adminUx.noNavigationResults')}</p>}
        </nav>
      </aside>

      <div className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-left">
            <button
              type="button"
              className="adm-hamburger"
              aria-label={unreadTotal > 0 ? t('nav.openMenuWithUpdates') : t('nav.openMenu')}
              onClick={() => setIsSidebarOpen((open) => !open)}
              aria-controls="admin-sidebar-navigation"
              aria-expanded={isSidebarOpen}
            >
              &#9776;
              {/* The sidebar - and its badges - is off-canvas on a phone. */}
              {unreadTotal > 0 && <span className="nav-menu-dot" aria-hidden="true" />}
            </button>
            <div className="adm-topbar-context">
              <span className="adm-topbar-overline">{t('nav.adminTitle')}</span>
              <div className="adm-topbar-title">{activePageTitle}</div>
            </div>
          </div>
          <div className="adm-topbar-actions">
            <span className="user-name">{user?.name}</span>
            <button type="button" className="btn-secondary" onClick={() => setIsChangingPassword(true)}>
              {t('changePassword.button')}
            </button>
            <LanguageToggle />
            <button className="adm-logout-btn" onClick={logout}>
              {t('common.logOut')}
            </button>
          </div>
        </header>

        {isChangingPassword && (
          <ChangePasswordModal role={user?.role} onClose={() => setIsChangingPassword(false)} />
        )}

        <div className="adm-content">
          <Routes>
            <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/accounts" element={<AccountsPage />} />
            <Route path="/admin/warehouse-access" element={<AdminWarehouseAccessPage />} />
            <Route path="/admin/features" element={<FeatureControlCenter />} />
            <Route path="/admin/app-release" element={<AdminAppReleasePage />} />
            <Route path="/admin/maintenance" element={<AdminMaintenancePage />} />
            <Route path="/admin/visit-verification" element={<AdminVisitVerificationPage />} />
            <Route path="/admin/registration" element={<AdminRegistrationPage />} />
            <Route path="/admin/distribution" element={<AdminDistributionTripsPage />} />
            <Route path="/admin/pharmacy-licences" element={<AdminPharmacyLicencesPage />} />
            {/* Old bookmark - the section was renamed Pending Accounts -> Accounts. */}
            <Route path="/admin/pending-accounts" element={<Navigate to="/admin/accounts" replace />} />
            <Route path="/admin/offers" element={<AdminOffersPage />} />
            <Route path="/admin/discount-codes" element={<AdminDiscountCodesPage />} />
            <Route
              path="/admin/advertisements"
              element={<Navigate to="/admin/advertisements/general" replace />}
            />
            <Route path="/admin/advertisements/general" element={<AdminBannersPage />} />
            <Route path="/admin/advertisements/packages" element={<AdminAdvertisementsPage />} />
            {/* Old bookmark - banners became the "general" half of Advertisements. */}
            <Route
              path="/admin/banners"
              element={<Navigate to="/admin/advertisements/general" replace />}
            />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/catalog" element={<AdminCatalogPage />} />
            <Route path="/admin/catalog-requests" element={<AdminCatalogRequestsPage />} />
            <Route path="/admin/catalog-duplicates" element={<AdminDuplicatesPage />} />
            <Route path="/admin/manufacturers" element={<AdminManufacturersPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/commission" element={<AdminCommissionPage />} />
            <Route path="/admin/exchange-rate" element={<AdminExchangeRatePage />} />
            <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
            <Route path="/admin/complaints" element={<AdminComplaintsPage />} />
            <Route path="/admin/complaints/:complaintId" element={<AdminComplaintDetailPage />} />
            <Route path="*" element={<Navigate to="/admin/accounts" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
