import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { productSaveErrorMessage } from './ProductFormModal';

// The product form's own wording for the catalog-overhaul refusals (Phase 3):
// the brief's Arabic messages for a withdrawn medicine and an admin-disabled
// product, and the concurrent-edit conflict.

function tFor(lng) {
  const instance = i18next.createInstance();
  instance.init({ lng, resources: { en: { translation: en }, ar: { translation: ar } } });
  return instance.t.bind(instance);
}

describe('productSaveErrorMessage', () => {
  const t = tFor('ar');

  it('shows the Arabic message for a withdrawn catalog item', () => {
    expect(productSaveErrorMessage({ code: 'CATALOG_ITEM_WITHDRAWN' }, t)).toBe('الصنف مسحوب من القائمة المركزية');
  });

  it('shows the Arabic message for a product disabled by the administration', () => {
    expect(productSaveErrorMessage({ code: 'PRODUCT_DISABLED_BY_ADMIN' }, t)).toBe('معطّل من الإدارة');
  });

  it('explains a concurrent edit', () => {
    expect(productSaveErrorMessage({ code: 'PRODUCT_CHANGED' }, tFor('en'))).toMatch(/changed this product/);
  });

  it('falls back to the server message for anything else', () => {
    expect(productSaveErrorMessage({ code: 'SOMETHING', message: 'Server says no' }, t)).toBe('Server says no');
  });
});
