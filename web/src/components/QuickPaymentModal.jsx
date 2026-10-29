import { useEffect, useRef, useState } from 'react';
import { asciiDigits } from '../utils/digits';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { amountLeft, isValidPartial, parseWholeLiras } from '../utils/collectPayment';
import { createIdempotencyKeys } from '../utils/payments';

// Records a cash payment from a pharmacy straight from the accounts table:
// Inline beneath the triggering buttons: "full" confirms the balance and
// "partial" asks for the amount and shows the remainder. Stable keys ensure a
// retry after a dropped response cannot credit the pharmacy twice.
export function QuickPaymentModal({ mode, pharmacyId, pharmacyName, owedSyp, onClose, onDone, onBusyChange }) {
  const { t } = useTranslation();
  const [idempotencyKeys] = useState(createIdempotencyKeys);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const firstControl = useRef(null);
  const sending = useRef(false);
  useEffect(() => { firstControl.current?.focus(); }, []);

  const paid = mode === 'full' ? owedSyp : parseWholeLiras(amount);

  const submit = async (event) => {
    event.preventDefault();
    if (sending.current) return;
    if (mode === 'partial' && !isValidPartial(paid, owedSyp)) {
      setError(t('quickPay.partialInvalid'));
      return;
    }
    const payment = {
      pharmacyId,
      amount: paid,
      currency: 'SYP',
      method: 'cash',
    };
    sending.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await idempotencyKeys.submit(payment, (idempotencyKey) =>
        api.createPayment({ ...payment, idempotencyKey })
      );
      onDone(paid);
    } catch (err) {
      setError(err.message);
    } finally {
      sending.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  };

  return (
    <section className="inline-payment" role="region"
      aria-label={mode === 'full' ? t('quickPay.fullTitle') : t('quickPay.partialTitle')}
      aria-busy={saving} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && !sending.current) onClose(); }}>
        <h3>{mode === 'full' ? t('quickPay.fullTitle') : t('quickPay.partialTitle')}</h3>
        <p>{pharmacyName}</p>
        <form onSubmit={submit} className="product-form">
          {mode === 'full' ? (
            <p>{t('quickPay.fullConfirm', { amount: formatSyp(owedSyp) })}</p>
          ) : (
            <>
              <p className="hint">{t('quickPay.owes', { amount: formatSyp(owedSyp) })}</p>
              <label>
                {t('quickPay.paidLabel')}
                <input
                  type="text"
                  inputMode="numeric"
                  ref={firstControl}
                  dir="ltr"
                  disabled={saving}
                  value={amount}
                  onChange={(e) => {
                    setAmount(asciiDigits(e.target.value));
                    setError(null);
                  }}
                />
              </label>
              <p className="hint">{t('quickPay.left', { amount: formatSyp(amountLeft(owedSyp, paid)) })}</p>
            </>
          )}
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="collect-choices">
            <button ref={mode === 'full' ? firstControl : undefined} type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('quickPay.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
    </section>
  );
}
