import { NumericInput } from './NumericInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProductPicker } from './CatalogPickers';
import { formatUsdAsSyp } from '../utils/currency';
import { displayName } from '../utils/displayName';

// The one form used to create AND edit an offer, on both the warehouse and the
// admin Offers pages - the same "reuse the create form for editing" approach
// AdvertisementModal / ProductFormModal already take.
//
// - `searchProducts` given -> the product is searched for and picked
//   (ProductPicker - the warehouse's own catalog, on create or edit), a page
//   at a time rather than a <select> of every product (catalog overhaul
//   Phase 10).
// - `searchProducts` null  -> the product is shown read-only (the admin edits
//   an existing offer's discount / dates / names, not which product it is on).
//
// `onSubmit(payload)` does the actual API call; the payload is
// { productId, titleAr, titleEn, offerType, discountPercentage | bonuses, startDate, isPermanent }
// plus `endDate` only when it is not a permanent offer.

function toDateInputValue(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function initialForm(offer) {
  if (!offer) {
    return { product: null, productId: '', titleAr: '', titleEn: '', offerType: 'discount', discountPercentage: '', bonus: '', startDate: '', endDate: '', isPermanent: false };
  }
  return {
    product: offer.productId
      ? { id: offer.productId, nameAr: offer.productNameAr ?? null, nameEn: offer.productNameEn ?? null }
      : null,
    productId: offer.productId ?? '',
    titleAr: offer.titleAr ?? '',
    titleEn: offer.titleEn ?? '',
    offerType: offer.offerType || 'discount',
    discountPercentage: offer.offerType === 'bonus' ? '' : String(offer.discountPercentage ?? ''),
    bonus: (offer.bonuses ?? []).map((tier) => `${tier.buy}+${tier.free}`).join('، '),
    startDate: toDateInputValue(offer.startDate),
    endDate: toDateInputValue(offer.endDate),
    isPermanent: Boolean(offer.isPermanent),
  };
}

export function OfferModal({ mode, offer, searchProducts, usdToSyp, onClose, onSubmit, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => initialForm(offer));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const isEdit = mode === 'edit';
  const productName = offer ? displayName(offer.productNameEn, offer.productNameAr) : '';
  // The price only where the row carries one (search results do; the offer
  // being edited only has the product's name).
  const productLabel = (product) => {
    const name = displayName(product.nameEn, product.nameAr);
    return product.priceUsd != null ? `${name} (${formatUsdAsSyp(product.priceUsd, usdToSyp)})` : name;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!form.productId || !form.titleAr.trim() || !form.titleEn.trim() || !form.startDate) {
      setError(t('common.requiredFields'));
      return;
    }
    const isBonus = form.offerType === 'bonus';
    const discountPercentage = Number(form.discountPercentage);
    if (!isBonus && (!Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100)) {
      setError(t('offers.warehouse.discountRange'));
      return;
    }
    if (isBonus && !form.bonus.trim()) {
      setError(t('offers.warehouse.bonusRequired'));
      return;
    }
    if (!form.isPermanent) {
      if (!form.endDate) {
        setError(t('common.requiredFields'));
        return;
      }
      if (new Date(form.endDate) <= new Date(form.startDate)) {
        setError(t('common.endAfterStart'));
        return;
      }
    }

    const payload = {
      productId: form.productId,
      titleAr: form.titleAr.trim(),
      titleEn: form.titleEn.trim(),
      offerType: form.offerType,
      ...(isBonus ? { bonuses: form.bonus.trim() } : { discountPercentage }),
      startDate: form.startDate,
      isPermanent: form.isPermanent,
    };
    if (!form.isPermanent) payload.endDate = form.endDate;

    setIsSaving(true);
    try {
      await onSubmit(payload);
      onSaved();
    } catch (err) {
      // One offer per product: the product already has one running or waiting.
      if (err.code === 'OFFER_ALREADY_EXISTS') setError(t('offers.warehouse.alreadyHasOffer'));
      else if (err.code === 'OFFER_STOPPED') setError(t('offers.warehouse.offerStopped'));
      else setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{isEdit ? t('offers.warehouse.editTitle') : t('offers.warehouse.modalTitle')}</h2>
        <form onSubmit={handleSubmit} className="product-form">
          <label>
            {t('orderDetail.product')}
            {searchProducts ? (
              <ProductPicker
                search={searchProducts}
                selected={form.product}
                onChange={(product) =>
                  setForm((prev) => ({ ...prev, product, productId: product ? product.id : '' }))
                }
                renderLabel={productLabel}
                placeholder={t('offers.warehouse.selectProduct')}
              />
            ) : (
              <input value={productName} disabled />
            )}
          </label>

          <div className="form-row">
            <label>
              {t('offers.warehouse.titleEn')}
              <input value={form.titleEn} onChange={(e) => setField('titleEn', e.target.value)} required />
            </label>
            <label>
              {t('offers.warehouse.titleAr')}
              <input
                value={form.titleAr}
                onChange={(e) => setField('titleAr', e.target.value)}
                dir="rtl"
                required
              />
            </label>
          </div>

          {/* What the offer gives: a discount off the price, or a better bonus
              at the same price (the product's usual 10+2 becomes 10+3). */}
          <div className="offer-type-choice" role="radiogroup" aria-label={t('offers.warehouse.offerType')}>
            {['discount', 'bonus'].map((type) => (
              <label key={type} className={`offer-type-option${form.offerType === type ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="offerType"
                  value={type}
                  checked={form.offerType === type}
                  onChange={() => setField('offerType', type)}
                />
                {t(type === 'bonus' ? 'offers.warehouse.typeBonus' : 'offers.warehouse.typeDiscount')}
              </label>
            ))}
          </div>

          {form.offerType === 'bonus' ? (
            <label>
              {t('offers.warehouse.offerBonus')}
              <input
                value={form.bonus}
                onChange={(e) => setField('bonus', e.target.value)}
                placeholder="10+3"
                dir="ltr"
                required
              />
              <span className="hint">{t('offers.warehouse.offerBonusHint')}</span>
            </label>
          ) : (
            <label>
              {t('offers.warehouse.discountPercentage')}
              <NumericInput
                type="number"
                min="1"
                max="100"
                value={form.discountPercentage}
                onChange={(e) => setField('discountPercentage', e.target.value)}
                required
              />
            </label>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isPermanent}
              onChange={(e) => setField('isPermanent', e.target.checked)}
            />
            {t('offers.warehouse.permanentOffer')}
          </label>

          <div className="form-row">
            <label>
              {t('common.startDate')}
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)}
                required
              />
            </label>
            {form.isPermanent ? (
              <p className="hint">{t('offers.warehouse.permanentOfferHint')}</p>
            ) : (
              <label>
                {t('common.endDate')}
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setField('endDate', e.target.value)}
                  required
                />
              </label>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving
                ? t('offers.warehouse.submitting')
                : isEdit
                  ? t('offers.warehouse.saveChanges')
                  : t('offers.warehouse.submitForApproval')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
