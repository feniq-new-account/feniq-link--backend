import { useModalSafety } from '../hooks/useModalSafety';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSyp } from '../utils/currency';
import { amountLeft, isValidPartial, parseWholeLiras } from '../utils/collectPayment';

// Shown when the warehouse marks an order delivered: "قبضت؟" with three
// buttons side by side. `onChoose(paidSyp)` gets the whole amount (كامل), the
// part typed (جزء), or 0 (بعدين). Closing it chooses nothing, so the order
// stays on its way.
export function CollectPaymentModal({ orderNumber, totalSyp, onChoose, onClose }) {
  const { t } = useTranslation();
  const modal = useModalSafety(false, onClose);
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);

  const paid = parseWholeLiras(amount);

  const savePartial = (event) => {
    event.preventDefault();
    if (!isValidPartial(paid, totalSyp)) {
      setError(t('collect.partialInvalid'));
      return;
    }
    onChoose(paid);
  };

  return (
    <div className="modal-overlay" {...modal.overlayProps}>
      <div className="modal" {...modal.dialogProps}>
        <h2>{t('collect.title', { number: orderNumber })}</h2>
        <p>{t('collect.total', { amount: formatSyp(totalSyp) })}</p>
        <div className="collect-choices">
          <button type="button" className="btn-primary" onClick={() => onChoose(totalSyp)}>
            {t('collect.full')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPartial(true)}>
            {t('collect.partial')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => onChoose(0)}>
            {t('collect.later')}
          </button>
        </div>
        {partial && (
          <form onSubmit={savePartial} className="product-form">
            <label>
              {t('collect.paidLabel')}
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <p className="hint">{t('collect.left', { amount: formatSyp(amountLeft(totalSyp, paid)) })}</p>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn-primary">
              {t('collect.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
