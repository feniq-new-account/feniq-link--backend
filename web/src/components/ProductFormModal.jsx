import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { displayName } from '../utils/displayName';
import { sypFromUsd, formatUsd } from '../utils/currency';
import { submitWithRateCheck, withRateUsed } from '../utils/exchangeRate';
import { useExchangeRateActions } from '../context/ExchangeRateContext';
import { RateChangedNotice } from './RateChangedNotice';
import { ImagePicker } from './ImagePicker';

export const EMPTY_PRODUCT_FORM = {
  masterProductId: null,
  nameAr: '',
  nameEn: '',
  manufacturerAr: '',
  manufacturerEn: '',
  categoryId: '',
  unitAr: '',
  unitEn: '',
  // A code from the fixed unit list (GET /units) - the form's dropdown.
  unit: '',
  // Bonus tiers as typed, e.g. "10+1" or "10+1، 20+3" - parsed by the server.
  bonus: '',
  // The price the warehouse types is in SYP now (converted to the catalog's
  // stored USD on save, see handleSubmit). `priceUsd` carries the currently
  // stored value so an untouched edit re-sends it exactly, never a
  // rate-converted approximation.
  price: '',
  priceUsd: null,
  description: '',
  // Images are uploaded, never typed (catalog overhaul Phase 9): the
  // warehouse's current override, the catalog's central image it falls back
  // to, a picked file waiting to upload, and whether the override was removed.
  imageOverride: '',
  catalogImageUrl: null,
  imageFile: null,
  clearImage: false,
  manuallyDisabled: false,
};

export function productFormFromProduct(product, usdToSyp) {
  const priceSyp = sypFromUsd(product.priceUsd, usdToSyp);
  return {
    masterProductId: product.masterProductId ?? null,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    manufacturerAr: product.manufacturerAr,
    manufacturerEn: product.manufacturerEn,
    // `?? ''` for the same reason unitAr has it: an Excel-imported product
    // carries neither (the import format has no category/unit columns, see
    // warehouseProduct.service.js's importProductsFromExcel), and the
    // required-field check below calls .trim() on this value.
    categoryId: product.categoryId ?? '',
    unitAr: product.unitAr ?? '',
    unitEn: product.unitEn ?? '',
    unit: product.unit ?? '',
    bonus: formatBonusTiers(product.bonuses),
    // The SYP field is left blank when the rate hasn't loaded - the warehouse
    // then can't edit the price this session, but every other field still saves
    // (the untouched-price path re-sends the stored USD value).
    price: priceSyp != null ? String(priceSyp) : '',
    priceUsd: product.priceUsd,
    description: product.description ?? '',
    // An older server sends only `image`, which was the override itself.
    imageOverride: ('imageOverride' in product ? product.imageOverride : product.image) ?? '',
    catalogImageUrl: product.catalogImageUrl ?? null,
    imageFile: null,
    clearImage: false,
    manuallyDisabled: product.manuallyDisabled,
  };
}

// Section 7: isAvailable is derived (not manually paused) - the badge
// reflects that. Shared by the warehouse's own product table and the
// admin's cross-warehouse one.
// TODO(re-enable-stock): was also gated on stock > 0, with "Out of stock"
// called out distinctly from "Paused" - quantity tracking is on hold, see
// backend/src/models/product.model.js.
// `t` is threaded in explicitly (not a hook itself) since this runs outside
// component render in some call sites (table cell helpers).
// The save refusals that need their own wording rather than the server's
// English fallback: the medicine was withdrawn from the central catalog, the
// admin disabled this warehouse's product, or someone else saved the product
// while this form was open.
export function productSaveErrorMessage(err, t) {
  if (err?.code === 'CATALOG_ITEM_WITHDRAWN') return t('productForm.errorWithdrawn');
  if (err?.code === 'PRODUCT_DISABLED_BY_ADMIN') return t('productForm.errorDisabledByAdmin');
  if (err?.code === 'PRODUCT_CHANGED') return t('productForm.errorChanged');
  if (err?.code === 'INVALID_BONUS') return t('productForm.errorBonus');
  if (err?.code === 'INVALID_IMAGE_URL' || err?.code === 'INVALID_MEDIA_TYPE') return t('productForm.errorImage');
  return err?.message || t('common.unexpectedError');
}

// The description and image keys of a save (catalog overhaul Phase 9, L3).
// An emptied description on an edit is sent (empty), which clears it -
// dropping the key used to leave the old text in place. The image is only
// ever sent as null, to remove the override; a new image is uploaded after
// the save, never sent as a link.
export function descriptionAndImageFields({ mode, form, initial, imagesEnabled }) {
  const description = form.description.trim();
  return {
    description: mode === 'edit' ? description : description || undefined,
    image: imagesEnabled && form.clearImage && initial.imageOverride ? null : undefined,
  };
}

// Bonus tiers -> the text the form and the product tables show ("10+1، 20+3").
export function formatBonusTiers(tiers) {
  return (tiers ?? []).map((tier) => `${tier.buy}+${tier.free}`).join('، ');
}

export function productAvailabilityLabel(product, t) {
  return product.manuallyDisabled ? t('products.paused') : t('products.available');
}

export function productAvailabilityClass(product) {
  return product.isAvailable ? 'availability-available' : 'availability-paused';
}

// Section 14 Part 2: a medicine's name/manufacturer are only ever chosen by
// searching the central catalog, never typed - this is the search+select UI
// for that, used only when creating a product (an existing one's link isn't
// re-editable, see ProductFormModal below).
function CatalogSearchField({ onSelect }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    setIsSearching(true);
    // A slower response for an older query must never overwrite a newer one:
    // once the query changes, this effect's results are dropped.
    let stale = false;
    const timeout = setTimeout(async () => {
      try {
        const data = await api.warehouseCatalogSearch(query.trim());
        if (!stale) setResults(data.items);
      } catch {
        if (!stale) setResults([]);
      } finally {
        if (!stale) setIsSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <label>
      {t('productForm.searchMedicine')}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('productForm.searchPlaceholder')}
        dir="rtl"
      />
      {isSearching && <p className="hint">{t('productForm.searching')}</p>}
      {results.length > 0 && (
        <ul className="catalog-search-results">
          {results.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item)}>
                <strong>{item.nameAr}</strong>
                <span className="hint"> — {item.manufacturerAr}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!isSearching && query.trim() && results.length === 0 && (
        <p className="hint">{t('productForm.noMatch')}</p>
      )}
    </label>
  );
}

// The warehouse's override image: a preview of what the pharmacist will see
// (the picked file, else the override, else the catalog's central image), the
// shared image picker (a JPEG/PNG/WEBP file or a camera photo - the server
// re-checks the bytes) and a remove button that falls back to the catalog
// image.
export function ProductImageField({ form, setForm }) {
  const { t } = useTranslation();
  const fileUrl = useMemo(() => (form.imageFile ? URL.createObjectURL(form.imageFile) : null), [form.imageFile]);
  useEffect(() => () => fileUrl && URL.revokeObjectURL(fileUrl), [fileUrl]);

  const override = form.clearImage ? '' : form.imageOverride;
  const preview = fileUrl || override || form.catalogImageUrl;
  const showsCatalogImage = !fileUrl && !override && Boolean(form.catalogImageUrl);

  return (
    <div className="product-image-field">
      <span>{t('productForm.imageOptional')}</span>
      {preview ? (
        <img src={preview} alt="" className="product-image-preview" />
      ) : (
        <p className="hint">{t('productForm.noImage')}</p>
      )}
      {showsCatalogImage && <p className="hint">{t('productForm.catalogImageHint')}</p>}
      {/* A file from the gallery or a photo from the camera: either waits in
          imageFile and uploads after the product saves. */}
      <ImagePicker onFile={(file) => setForm((prev) => ({ ...prev, imageFile: file }))} />
      {(fileUrl || override) && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setForm((prev) => ({ ...prev, imageFile: null, clearImage: true }))}
        >
          {t('productForm.removeImage')}
        </button>
      )}
    </div>
  );
}

// The form itself is identical whether a warehouse is creating/editing its
// own product or an admin is editing someone else's (Section 13c: admin
// edits/deletes, it never creates) - only WHERE the submission goes differs,
// so that's left entirely to the caller via onSubmit rather than hardcoded
// here.
// `onUploadImage(productId, file)`, when given, shows the image section (the
// warehouse's override image, uploaded after the product saves); without it
// (the admin's edit) the form never touches the image.
export function ProductFormModal({ mode, initialForm, categories, usdToSyp, onClose, onSaved, onSubmit, onUploadImage }) {
  const { t } = useTranslation();
  const rateActions = useExchangeRateActions();
  const [form, setForm] = useState(initialForm);
  // The form as it opened - what "the price was not touched" is measured
  // against. Held here rather than read off the `initialForm` prop: the parent
  // rebuilds that prop at whatever rate is current, so after the rate moves
  // an untouched price would no longer match it and would be re-converted.
  const [initial, setInitial] = useState(initialForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  // Set by a RATE_CHANGED refusal until the next submit - see RateChangedNotice.
  const [rateChange, setRateChange] = useState(null);
  const [units, setUnits] = useState([]);
  // Set once the product itself saved but its image upload failed: submitting
  // again only retries the upload (a second create would be refused).
  const [savedProductId, setSavedProductId] = useState(null);

  useEffect(() => {
    api
      .units()
      .then((data) => setUnits(data.units))
      .catch(() => setUnits([]));
  }, []);

  // When the rate moves (it loads late, or a refusal replaced it), an
  // untouched price follows it: the SYP shown is re-derived from the stored
  // USD, and it stays "untouched" so saving still re-sends that USD exactly.
  // A price the user typed is left as typed.
  useEffect(() => {
    if (mode !== 'edit' || initial.priceUsd == null) return;
    const priceSyp = sypFromUsd(initial.priceUsd, usdToSyp);
    const nextPrice = priceSyp != null ? String(priceSyp) : '';
    if (nextPrice === String(initial.price)) return;
    const previousPrice = String(initial.price);
    setForm((prev) => (String(prev.price) === previousPrice ? { ...prev, price: nextPrice } : prev));
    setInitial((prev) => ({ ...prev, price: nextPrice }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdToSyp]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleCatalogSelect = (item) => {
    setForm((prev) => ({
      ...prev,
      masterProductId: item.id,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      manufacturerAr: item.manufacturerAr,
      manufacturerEn: item.manufacturerEn,
    }));
  };

  const handleChangeSelection = () => {
    setForm((prev) => ({
      ...prev,
      masterProductId: null,
      nameAr: '',
      nameEn: '',
      manufacturerAr: '',
      manufacturerEn: '',
    }));
  };

  // The whole body runs inside one try/catch, not just the network call: a
  // throw anywhere in the validation/conversion above it (a null field
  // reaching .trim(), say) used to escape the handler entirely, leaving the
  // modal open with no error shown and no save - indistinguishable from a
  // dead button. Anything unexpected now surfaces as a message.
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    try {
      await submitForm();
    } catch (err) {
      setError(err?.message || t('common.unexpectedError'));
      setIsSaving(false);
    }
  };

  const uploadPickedImage = async (productId) => {
    try {
      await onUploadImage(productId, form.imageFile);
      onSaved();
    } catch (err) {
      setSavedProductId(productId);
      setError(`${t('productForm.imageUploadFailed')} ${productSaveErrorMessage(err, t)}`);
    }
  };

  const submitForm = async () => {
    if (savedProductId) {
      setIsSaving(true);
      await uploadPickedImage(savedProductId);
      setIsSaving(false);
      return;
    }
    if (mode === 'create' && !form.masterProductId) {
      setError(t('productForm.selectMedicineRequired'));
      return;
    }

    // A unit from the list is required - except on an edit of an older
    // product that still carries its free-text unit, which may keep it.
    const hasLegacyUnit = mode === 'edit' && form.unitAr.trim() && form.unitEn.trim();
    if (!form.categoryId.trim() || (!form.unit && !hasLegacyUnit)) {
      setError(t('common.requiredFields'));
      return;
    }
    // The catalog stores prices in USD (backend product.model.js). Convert the
    // SYP the warehouse typed at the current rate - EXCEPT when this is an edit
    // whose SYP field was never touched: then re-send the exact stored USD
    // value, so a rate that has moved since the product was created can never
    // silently re-price it (or write a spurious priceHistory entry), and so
    // the other fields stay editable even while the rate is unavailable.
    const priceUntouched =
      mode === 'edit' && form.priceUsd != null && String(form.price) === String(initial.price);

    let priceUsd;
    // The rate a converted price was worked out at - sent along so the server
    // can refuse it if that rate is no longer current. None for an untouched
    // price: nothing was converted.
    let rateUsed = null;
    if (priceUntouched) {
      priceUsd = form.priceUsd;
    } else {
      const priceSyp = Number(form.price);
      if (!Number.isFinite(priceSyp) || priceSyp <= 0) {
        setError(t('productForm.pricePositive'));
        return;
      }
      if (usdToSyp == null || !(Number(usdToSyp) > 0)) {
        setError(t('productForm.rateRequired'));
        return;
      }
      rateUsed = Number(usdToSyp);
      priceUsd = Math.round((priceSyp / rateUsed) * 100) / 100;
      if (priceUsd < 0.01) {
        setError(t('productForm.pricePositive'));
        return;
      }
    }

    const payload = withRateUsed(
      {
        masterProductId: mode === 'create' ? form.masterProductId : undefined,
        categoryId: form.categoryId,
        ...(form.unit ? { unit: form.unit } : { unitAr: form.unitAr.trim(), unitEn: form.unitEn.trim() }),
        // An emptied bonus field on an edit clears the bonus; on a create
        // there is nothing to clear.
        bonus: mode === 'edit' || form.bonus.trim() ? form.bonus.trim() : undefined,
        priceUsd,
        ...descriptionAndImageFields({ mode, form, initial, imagesEnabled: Boolean(onUploadImage) }),
        manuallyDisabled: form.manuallyDisabled,
      },
      rateUsed
    );

    setIsSaving(true);
    setRateChange(null);
    try {
      // Sent once. A RATE_CHANGED refusal moves the panel's rate on and comes
      // back as `changed`; the price then waits for the user to confirm it.
      const { result, rateChange: changed } = await submitWithRateCheck(() => onSubmit(payload), {
        rateUsed,
        actions: rateActions,
      });
      if (changed) {
        setRateChange(changed);
        return;
      }
      const productId = result?.product?.id;
      if (onUploadImage && form.imageFile && productId) {
        await uploadPickedImage(productId);
        return;
      }
      onSaved();
    } catch (err) {
      setError(productSaveErrorMessage(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>{mode === 'create' ? t('productForm.addTitle') : t('productForm.editTitle')}</h2>
        <form onSubmit={handleSubmit} className="product-form">
          {mode === 'create' && !form.masterProductId ? (
            <CatalogSearchField onSelect={handleCatalogSelect} />
          ) : (
            <div className="catalog-selected-display">
              <p>
                <strong>{displayName(form.nameEn, form.nameAr)}</strong>
              </p>
              <p className="hint">{displayName(form.manufacturerEn, form.manufacturerAr)}</p>
              {mode === 'create' && (
                <button type="button" className="btn-secondary" onClick={handleChangeSelection}>
                  {t('productForm.change')}
                </button>
              )}
            </div>
          )}
          <div className="form-row">
            <label>
              {t('productForm.unit')}
              <select value={form.unit} onChange={(e) => setField('unit', e.target.value)}>
                <option value="">
                  {form.unit === '' && form.unitAr ? `${form.unitAr} (${t('productForm.legacyUnit')})` : '—'}
                </option>
                {units.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.nameAr} · {unit.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('productForm.bonus')}
              <input
                value={form.bonus}
                onChange={(e) => setField('bonus', e.target.value)}
                placeholder="10+1"
                dir="ltr"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              {t('common.category')}
              <select value={form.categoryId} onChange={(e) => setField('categoryId', e.target.value)} required>
                <option value="" disabled>
                  {t('productForm.selectCategory')}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nameEn}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t('productForm.priceSyp')}
            <input
              type="number"
              min="1"
              step="1"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              required
            />
          </label>
          {usdToSyp != null && Number(form.price) > 0 && (
            <p className="hint">
              {t('productForm.approxUsd', { amount: formatUsd(Number(form.price) / usdToSyp) })}
            </p>
          )}
          {usdToSyp == null && (
            <p className="hint">{t('productForm.rateRequired')}</p>
          )}
          <label>
            {t('productForm.descriptionOptional')}
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={2}
            />
          </label>
          {onUploadImage && <ProductImageField form={form} setForm={setForm} />}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.manuallyDisabled}
              onChange={(e) => setField('manuallyDisabled', e.target.checked)}
            />
            {t('productForm.temporarilyPaused')}
          </label>

          <RateChangedNotice rateChange={rateChange} />
          {error && <p className="error-text">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving
                ? t('common.saving')
                : rateChange
                  ? t('exchangeRateChange.confirmButton')
                  : mode === 'create'
                    ? t('products.addProduct')
                    : t('productForm.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
