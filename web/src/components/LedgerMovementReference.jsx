import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// A reference identifies the immutable movement. Navigation goes only to the
// existing, server-scoped order/return screens; payments have no detail route.
export function LedgerMovementReference({ row }) {
  const { t } = useTranslation();
  const ref = row.reference || {};
  const orderLabel = ref.invoiceNumber != null ? t('settlement.invoiceNumber', { number: ref.invoiceNumber })
    : ref.orderNumber != null ? t('orders.orderNumber', { number: ref.orderNumber }) : t('accounting.openOrder');
  return <>
    {row.entryNumber != null && <div className="wh-num">LE-{row.entryNumber}</div>}
    {(ref.orderId || ref.invoiceNumber != null || ref.orderNumber != null) && <div>
      {ref.orderId ? <Link to={`/warehouse/orders/${encodeURIComponent(ref.orderId)}`}>{orderLabel}</Link> : orderLabel}
    </div>}
    {ref.invoiceNumber != null && ref.orderNumber != null && <div className="wh-table-sub">{t('orders.orderNumber', { number: ref.orderNumber })}</div>}
    {ref.paymentNumber != null && <div>{t('debts.paymentNumber', { number: ref.paymentNumber })}</div>}
    {ref.method && <div className="wh-table-sub">{t(`debts.method_${ref.method}`)}</div>}
    {ref.returnId && <div><Link to={`/warehouse/returns/${encodeURIComponent(ref.returnId)}`}>{t('accounting.openReturn')}</Link></div>}
    {row.reversalOf && <div className="wh-table-sub">{t('accounting.reversalReference')}: <span dir="ltr">{String(row.reversalOf)}</span></div>}
    {row.entryNumber == null && !ref.orderId && ref.invoiceNumber == null && ref.orderNumber == null && ref.paymentNumber == null && !ref.returnId && !row.reversalOf && <span>—</span>}
  </>;
}
