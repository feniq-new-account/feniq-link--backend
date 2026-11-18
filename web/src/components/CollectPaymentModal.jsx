import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { asciiDigits } from '../utils/digits';
import { useTranslation } from 'react-i18next';
import { formatSyp } from '../utils/currency';
import { amountLeft, isValidPartial, parseWholeLiras } from '../utils/collectPayment';

// Shown when the warehouse marks an order delivered: "قبضت؟". `onChoose(paidSyp)`
// gets the whole amount (كامل), the part typed (جزء), or 0 (بعدين / المندوب لمّها).
// Closing it chooses nothing, so the order stays on its way.
//
// A cash-only warehouse (warehouse.allowsCredit false, the default - owner
// decision 2026-11-18) is offered only "paid in full" and "the rep collected
// it" (Feniq's rep takes the cash, so nothing is recorded here). "Part" and
// "later" appear once the admin allows credit. Until the setting is read the
// cash-only choices show; `allowsCredit` overrides the lookup.
export function CollectPaymentModal({ orderNumber, totalSyp, onChoose, onClose, allowsCredit: allowsCreditProp }) {
  const { t } = useTranslation();
  const [allowsCreditLoaded, setAllowsCreditLoaded] = useState(false);
  useEffect(() => {
    if (allowsCreditProp !== undefined) return undefined;
    let live = true;
    Promise.resolve(api.warehouseSettings?.())
      .then((result) => { if (live) setAllowsCreditLoaded(result?.settings?.allowsCredit === true); })
      .catch(() => {});
    return () => { live = false; };
  }, [allowsCreditProp]);
  const allowsCredit = allowsCreditProp ?? allowsCreditLoaded;
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
          {allowsCredit ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => setPartial(true)}>
                {t('collect.partial')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => choose(0)}>
                {t('collect.later')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => choose(0)}>
              {t('collect.repCollected')}
            </button>
          )}
        </div>
        {!allowsCredit && <p className="hint">{t('collect.cashOnlyHint')}</p>}
        {partial && allowsCredit && (
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
