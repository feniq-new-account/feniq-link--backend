import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProductPicker } from './CatalogPickers';
import { displayName } from '../utils/displayName';
import {
  buildDiscountCodePayload,
  discountCodeErrorKey,
  initialDiscountCodeForm,
} from '../pages/discountCodesFilters';

// The one form to create AND edit a discount code, on the warehouse's page and
// the admin's. The code string is never typed - the server generates it.
//
// - `searchPharmacies(query)` resolves to [{ id, nameAr, nameEn }]: the
//   warehouse's own customers on the warehouse page, any approved pharmacy on
//   the admin's. Only used on create: who a code is for is fixed once made.
// - `onSubmit(payload)` makes the API call; `isWarehouse` only changes the
//   submit button's wording ("submit for approval").
export function DiscountCodeModal({ mode, code, searchPharmacies, isWarehouse, onClose, onSubmit, onSaved }) {
  const { t } = useTranslation();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => initialDiscountCodeForm(code));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const pharmacyLabel = (pharmacy) => displayName(pharmacy.nameEn, pharmacy.nameAr);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    const { payload, error: formError } = buildDiscountCodePayload(form, { isEdit });
    if (formError) {
      setError(t(formError));
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit(payload);
      onSaved();
    } catch (err) {
      const key = discountCodeErrorKey(err.code);
      setError(key ? t(key) : err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          {isEdit ? t('discountCodes.form.editTitle', { code: code.code }) : t('discountCodes.form.createTitle')}
        </h2>
        {!isEdit && <p className="hint">{t('discountCodes.form.codeGeneratedHint')}</p>}
        {isEdit && isWarehouse && code.status === 'approved' && (
          <p className="hint">{t('discountCodes.form.editNeedsApproval')}</p>
        )}

        <form onSubmit={handleSubmit} className="product-form">
          <div className="form-row">
            <label className="checkbox-row">
              <input
                type="radio"
                name="discount-code-type"
                checked={form.type === 'percentage'}
                onChange={() => setField('type', 'percentage')}
              />
              {t('discountCodes.type.percentage')}
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="discount-code-type"
                checked={form.type === 'fixed'}
                onChange={() => setField('type', 'fixed')}
              />
              {t('discountCodes.type.fixed')}
            </label>
          </div>

          <label>
            {form.type === 'percentage' ? t('discountCodes.form.percentValue') : t('discountCodes.form.fixedValue')}
            <input
              type="number"
              min={form.type === 'percentage' ? '0.01' : '1'}
              max={form.type === 'percentage' ? '100' : undefined}
              step={form.type === 'percentage' ? '0.01' : '1'}
              value={form.value}
              onChange={(e) => setField('value', e.target.value)}
              required
            />
          </label>
          {form.type === 'fixed' && <p className="hint">{t('discountCodes.form.fixedHint')}</p>}

          <div className="form-row">
            <label>
              {t('common.startDate')}
              <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} required />
            </label>
            <label>
              {t('common.endDate')}
              <input type="date" value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} required />
            </label>
          </div>

          <div className="form-row">
            <label>
              {t('discountCodes.form.maxUses')}
              <input
                type="number"
                min="1"
                step="1"
                value={form.maxUses}
                placeholder={t('discountCodes.form.unlimited')}
                onChange={(e) => setField('maxUses', e.target.value)}
              />
            </label>
            <label>
              {t('discountCodes.form.maxUsesPerPharmacy')}
              <input
                type="number"
                min="1"
                step="1"
                value={form.maxUsesPerPharmacy}
                placeholder={t('discountCodes.form.unlimited')}
                onChange={(e) => setField('maxUsesPerPharmacy', e.target.value)}
              />
            </label>
          </div>

          {isEdit ? (
            <p className="hint">
              {t('discountCodes.form.scopeLabel')}:{' '}
              <strong>
                {code.pharmacy ? pharmacyLabel(code.pharmacy) : t('discountCodes.scope.general')}
              </strong>
            </p>
          ) : (
            <>
              <div className="form-row">
                <label className="checkbox-row">
                  <input
                    type="radio"
                    name="discount-code-scope"
                    checked={form.scope === 'general'}
                    onChange={() => setForm((prev) => ({ ...prev, scope: 'general', pharmacy: null }))}
                  />
                  {t('discountCodes.scope.general')}
                </label>
                <label className="checkbox-row">
                  <input
                    type="radio"
                    name="discount-code-scope"
                    checked={form.scope === 'pharmacy'}
                    onChange={() => setField('scope', 'pharmacy')}
                  />
                  {t('discountCodes.scope.pharmacy')}
                </label>
              </div>
              {form.scope === 'pharmacy' && (
                <label>
                  {t('discountCodes.form.pharmacy')}
                  <ProductPicker
                    search={searchPharmacies}
                    selected={form.pharmacy}
                    onChange={(pharmacy) => setField('pharmacy', pharmacy)}
                    renderLabel={pharmacyLabel}
                    placeholder={
                      isWarehouse
                        ? t('discountCodes.form.searchCustomers')
                        : t('discountCodes.form.searchPharmacies')
                    }
                  />
                </label>
              )}
              {form.scope === 'pharmacy' && <p className="hint">{t('discountCodes.form.pharmacyNotifiedHint')}</p>}
            </>
          )}

          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving
                ? t('discountCodes.form.saving')
                : isEdit
                  ? t('discountCodes.form.save')
                  : isWarehouse
                    ? t('discountCodes.form.submitForApproval')
                    : t('discountCodes.form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
