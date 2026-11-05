import { AdminAnalyticsPage } from './AdminAnalyticsPage';
import { AdminVisitVerificationPage } from './AdminVisitVerificationPage';
import { AdminAppReleasePage } from './AdminAppReleasePage';
import { AdminWarehouseAccessPage } from './AdminWarehouseAccessPage';
import { FeatureControlCenter } from '../components/FeatureControlCenter';
import { useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
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

  const TABS = [
    { path: '/admin/dashboard', label: t('nav.dashboard') },
    { path: '/admin/analytics', label: t('analytics.title') },
    { path: '/admin/accounts', label: t('nav.accounts') },
    { path: '/admin/warehouse-access', label: t('warehouseAccess.title') },
    { path: '/admin/features', label: t('featureControl.title') },
    { path: '/admin/app-release', label: t('appRelease.title') },
    { path: '/admin/visit-verification', label: t('visitVerification.title') },
    // Who gets in when a pharmacy signs up: the approval switch, the
    // syndicate list and the Telegram bot.
    { path: '/admin/registration', label: t('nav.registration') },
    { path: '/admin/distribution', label: t('nav.distributionTrips') },
    { path: '/admin/pharmacy-licences', label: t('nav.pharmacyLicences') },
    { path: '/admin/offers', label: t('nav.offers') },
    // Review queue for warehouse codes, the platform's own codes, every code.
    { path: '/admin/discount-codes', label: t('nav.discountCodes'), feature: 'discountCodes' },
    // One tab, two sub-sections (general ads / package ads) - see
    // AdvertisementsSubNav. They were separate tabs until it turned out both
    // render as "الإعلانات" in Arabic.
    { path: '/admin/advertisements', label: t('nav.advertisements') },
    { path: '/admin/products', label: t('nav.products') },
    { path: '/admin/catalog', label: t('nav.centralCatalog') },
    // Catalog overhaul Phase 5: warehouses' new-item requests and the
    // manufacturer list.
    { path: '/admin/catalog-requests', label: t('nav.catalogRequests') },
    // Duplicate review (/admin/catalog-duplicates, route kept below) is hidden: the unique identityKey index prevents duplicates, so it is only needed after migrating a legacy database.
    { path: '/admin/manufacturers', label: t('nav.manufacturers') },
    // Where the categories the catalog import creates get renamed or merged.
    { path: '/admin/categories', label: t('nav.categories') },
    // The platform's side of the money: what each warehouse owes in
    // commission for a chosen window, and what it has actually handed over.
    { path: '/admin/commission', label: t('nav.commission') },
    { path: '/admin/exchange-rate', label: t('nav.exchangeRate') },
    { path: '/admin/notifications', label: t('nav.notifications') },
    { path: '/admin/complaints', label: t('nav.complaints') },
  ];

  // Closing on every route change covers both a tab click and any in-page
  // "back" navigation - anything that changes the URL while the mobile
  // drawer happens to be open.
  const closeSidebar = () => setIsSidebarOpen(false);
  // Phone-width tables become cards whose cells name their column.
  const shellRef = useRef(null);
  useStackedTableLabels(shellRef);

  return (
    <div className="admin-shell" ref={shellRef}>
      <div
        className={`adm-sidebar-backdrop${isSidebarOpen ? ' adm-sidebar-open' : ''}`}
        onClick={closeSidebar}
      />
      <aside className={`adm-sidebar${isSidebarOpen ? ' adm-sidebar-open' : ''}`}>
        <div className="adm-sidebar-header">
          <img className="adm-sidebar-logo" src="/images/feniq-mark-dark.png" alt={t('nav.brandName')} />
          <div className="adm-sidebar-brand">{t('nav.brandName')}</div>
          <div className="adm-sidebar-subtitle">{t('nav.adminTitle')}</div>
        </div>
        <nav className="adm-nav">
          {TABS.filter((tab) => isFeatureShown(tab.feature)).map((tab) => (
            <NavLink key={tab.path} to={tab.path} className={navLinkClassName} onClick={closeSidebar}>
              {tab.label}
              <NavBadge count={countUnder(tab.path)} />
            </NavLink>
          ))}
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
            >
              &#9776;
              {/* The sidebar - and its badges - is off-canvas on a phone. */}
              {unreadTotal > 0 && <span className="nav-menu-dot" aria-hidden="true" />}
            </button>
            <div className="adm-topbar-title">{t('nav.adminTitle')}</div>
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
