import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatBadgeCount } from '../realtime/unreadBadges';
import { useUnreadBadges } from '../realtime/UnreadBadgesProvider';

// The same warehouse-scoped socket badges used by the sidebar, not another
// connection and not a made-up order count. Admin decisions arrive on the
// owning warehouse's offer/banner/package/discount-code channels.
const LABELS = {
  orders: 'warehouseNotices.newOrders',
  returns: 'nav.returns',
  offers: 'nav.offers',
  banners: 'nav.advertisements',
  packages: 'nav.advertisements',
  discountCodes: 'nav.discountCodes',
  reviews: 'nav.reviews',
  repVisits: 'nav.reps',
  complaints: 'nav.complaints',
};

export function WarehouseNotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { total, items } = useUnreadBadges();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on navigation and outside clicks; keep links keyboard-accessible.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="wh-notice-center" ref={rootRef}>
      <button
        type="button"
        className="wh-notice-trigger"
        aria-label={t('warehouseNotices.bellCount', { count: total })}
        aria-expanded={open}
        aria-controls="wh-notice-list"
        onClick={() => setOpen((value) => !value)}
        title={t('warehouseNotices.title')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {total > 0 && <span className="wh-notice-count" aria-hidden="true">{formatBadgeCount(total)}</span>}
      </button>
      {open && (
        <section className="wh-notice-popover" id="wh-notice-list"
          aria-label={t('warehouseNotices.title')}>
          <h2>{t('warehouseNotices.title')}</h2>
          {items.length === 0 ? (
            <p className="wh-notice-empty">{t('warehouseNotices.empty')}</p>
          ) : (
            <div className="wh-notice-list">
              {items.map((item) => (
                <button
                  type="button"
                  className="wh-notice-item"
                  key={item.id}
                  onClick={() => { setOpen(false); navigate(item.path); }}
                >
                  <span>{t(LABELS[item.id] ?? 'warehouseNotices.update')}</span>
                  <span className="wh-notice-item-count" aria-label={t('nav.unreadBadge', { count: item.count })}>
                    {formatBadgeCount(item.count)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="wh-notice-footnote">{t('warehouseNotices.note')}</p>
        </section>
      )}
    </div>
  );
}
