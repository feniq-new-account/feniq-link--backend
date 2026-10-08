import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { formatSyp } from '../utils/currency';
import { amountLeft, isValidPartial, parseWholeLiras } from '../utils/collectPayment';
import { createIdempotencyKeys } from '../utils/payments';

// Records a cash payment from a pharmacy straight from the accounts table:
// "full" pays what it owes after a small confirm, "partial" asks for the
// amount and shows what is left. One idempotency key per open modal, so a
// retry after a dropped response cannot credit the pharmacy twice.
export function QuickPaymentModal({ mode, pharmacyId, pharmacyName, owedSyp, onClose, onDone }) {
  const { t } = useTranslation();
  const [idempotencyKeys] = useState(createIdempotencyKeys);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const paid = mode === 'full' ? owedSyp : parseWholeLiras(amount);

  const submit = async (event) => {
    event.preventDefault();
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
    setSaving(true);
    setError(null);
    try {
      await idempotencyKeys.submit(payment, (idempotencyKey) =>
        api.createPayment({ ...payment, idempotencyKey })
      );
      onDone(paid);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{mode === 'full' ? t('quickPay.fullTitle') : t('quickPay.partialTitle')}</h2>
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
                  autoFocus
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                />
              </label>
              <p className="hint">{t('quickPay.left', { amount: formatSyp(amountLeft(owedSyp, paid)) })}</p>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <div className="collect-choices">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('quickPay.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
