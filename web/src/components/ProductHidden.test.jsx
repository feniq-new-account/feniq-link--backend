import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import {
  EMPTY_PRODUCT_FORM,
  productAvailabilityClass,
  productAvailabilityLabel,
  productFormFromProduct,
} from './ProductFormModal';

// A warehouse can hide a product from the pharmacists' catalog altogether, not
// only mark it unavailable; the products table says which one it is.

function tFor(lng) {
  const instance = i18next.createInstance();
  instance.init({ lng, fallbackLng: lng, resources: { en: { translation: en }, ar: { translation: ar } } });
  return instance.t.bind(instance);
}

const base = { nameAr: 'دواء', manufacturerAr: 'شركة', priceUsd: 2, isAvailable: true, manuallyDisabled: false };

describe('hidden from the catalog', () => {
  it('labels a hidden product as hidden, even when it is also unavailable', () => {
    const t = tFor('ar');
    expect(productAvailabilityLabel({ ...base, hiddenByWarehouse: true }, t)).toBe('مخفي من الكتالوج');
    expect(productAvailabilityLabel({ ...base, hiddenByWarehouse: true, manuallyDisabled: true, isAvailable: false }, t)).toBe('مخفي من الكتالوج');
    expect(productAvailabilityClass({ ...base, hiddenByWarehouse: true })).toBe('availability-hidden');
  });

  it('keeps the available / unavailable labels for a shown product', () => {
    const t = tFor('ar');
    expect(productAvailabilityLabel(base, t)).toBe('متوفر');
    expect(productAvailabilityLabel({ ...base, manuallyDisabled: true, isAvailable: false }, t)).toBe('غير متوفر');
    expect(productAvailabilityClass({ ...base, manuallyDisabled: true, isAvailable: false })).toBe('availability-paused');
  });

  it('the edit form starts from the product, a new one shown', () => {
    expect(EMPTY_PRODUCT_FORM.hiddenByWarehouse).toBe(false);
    expect(productFormFromProduct({ ...base, hiddenByWarehouse: true }, 13000).hiddenByWarehouse).toBe(true);
    expect(productFormFromProduct(base, 13000).hiddenByWarehouse).toBe(false);
  });

  it('explains the two switches differently in both languages', () => {
    for (const lng of ['ar', 'en']) {
      const t = tFor(lng);
      expect(t('productForm.hiddenFromCatalog')).not.toBe(t('productForm.temporarilyPaused'));
      expect(t('productForm.hiddenFromCatalog')).not.toBe('productForm.hiddenFromCatalog');
    }
  });
});
