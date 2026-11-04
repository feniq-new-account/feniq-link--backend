import { useRef, useState } from 'react';
import { asciiDigits } from '../utils/digits';
import { useTranslation } from 'react-i18next';
import { formatSyp } from '../utils/currency';
import { amountLeft, isValidPartial, parseWholeLiras } from '../utils/collectPayment';

// Shown when the warehouse marks an order delivered: "قبضت؟" with three
// buttons side by side. `onChoose(paidSyp)` gets the whole amount (كامل), the
// part typed (جزء), or 0 (بعدين). Closing it chooses nothing, so the order
// stays on its way.
export function CollectPaymentModal({ orderNumber, totalSyp, onChoose, onClose }) {
  const { t } = useTranslation();
  const choosing = useRef(false);
  const choose = (amount) => { if (choosing.current) return; choosing.current = true; onChoose(amount); };
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
    choose(paid);
  };

  return (
    <section className="inline-payment" role="region" aria-label={t('collect.title', { number: orderNumber })}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && !choosing.current) onClose(); }}>
        <h3>{t('collect.title', { number: orderNumber })}</h3>
        <p>{t('collect.total', { amount: formatSyp(totalSyp) })}</p>
        <div className="collect-choices">
          <button type="button" className="btn-primary" onClick={() => choose(totalSyp)}>
            {t('collect.full')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPartial(true)}>
            {t('collect.partial')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => choose(0)}>
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
                dir="ltr"
                value={amount}
                onChange={(e) => {
                  setAmount(asciiDigits(e.target.value));
                  setError(null);
                }}
              />
            </label>
            <p className="hint">{t('collect.left', { amount: formatSyp(amountLeft(totalSyp, paid)) })}</p>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button type="submit" className="btn-primary">
              {t('collect.save')}
            </button>
          </form>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
    </section>
  );
}
