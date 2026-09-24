import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import {
  EMPTY_PRODUCT_FORM,
  ProductImageField,
  descriptionAndImageFields,
  productFormFromProduct,
  productSaveErrorMessage,
} from './ProductFormModal';

// Catalog overhaul Phase 9 (M7, L3): the product form uploads images instead of
// taking a typed link, and an edit can clear the override image and the
// description.

function i18nFor(lng) {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng,
    fallbackLng: lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return instance;
}

const CENTRAL = 'https://res.cloudinary.com/feniq/image/upload/v1/catalog/c.png';
const OVERRIDE = 'https://res.cloudinary.com/feniq/image/upload/v1/products/o.png';

function renderField(form, lng = 'en') {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18nFor(lng)}>
      <ProductImageField form={{ ...EMPTY_PRODUCT_FORM, ...form }} setForm={() => {}} />
    </I18nextProvider>
  );
}

describe('descriptionAndImageFields', () => {
  const edit = (form, initial = form) => descriptionAndImageFields({
    mode: 'edit',
    form: { ...EMPTY_PRODUCT_FORM, ...form },
    initial: { ...EMPTY_PRODUCT_FORM, ...initial },
    imagesEnabled: true,
  });

  it('sends an emptied description on an edit, so the server clears it', () => {
    expect(edit({ description: '   ' }).description).toBe('');
  });

  it('leaves an empty description out of a create', () => {
    const fields = descriptionAndImageFields({
      mode: 'create',
      form: EMPTY_PRODUCT_FORM,
      initial: EMPTY_PRODUCT_FORM,
      imagesEnabled: true,
    });
    expect('description' in fields && fields.description !== undefined).toBe(false);
    expect(fields.image).toBeUndefined();
  });

  it('sends image: null only when an existing override was removed', () => {
    expect(edit({ imageOverride: OVERRIDE, clearImage: true }).image).toBeNull();
    expect(edit({ imageOverride: OVERRIDE, clearImage: false }).image).toBeUndefined();
    // Nothing to clear.
    expect(edit({ imageOverride: '', clearImage: true }).image).toBeUndefined();
  });

  it('never sends a link, and the admin form (no uploads) never touches the image', () => {
    const fields = descriptionAndImageFields({
      mode: 'edit',
      form: { ...EMPTY_PRODUCT_FORM, imageOverride: OVERRIDE, clearImage: true },
      initial: { ...EMPTY_PRODUCT_FORM, imageOverride: OVERRIDE },
      imagesEnabled: false,
    });
    expect(fields.image).toBeUndefined();
    expect(edit({ imageOverride: OVERRIDE }).image).toBeUndefined();
  });
});

describe('productFormFromProduct', () => {
  it('reads the override apart from the effective image', () => {
    const form = productFormFromProduct(
      { priceUsd: 1, image: CENTRAL, imageOverride: null, catalogImageUrl: CENTRAL, manuallyDisabled: false },
      100
    );
    expect(form.imageOverride).toBe('');
    expect(form.catalogImageUrl).toBe(CENTRAL);
  });

  it('treats `image` as the override on an older server that sends nothing else', () => {
    const form = productFormFromProduct({ priceUsd: 1, image: OVERRIDE, manuallyDisabled: false }, 100);
    expect(form.imageOverride).toBe(OVERRIDE);
    expect(form.catalogImageUrl).toBeNull();
  });
});

describe('ProductImageField', () => {
  it('has a file picker and no free-text link input', () => {
    const html = renderField({});
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).not.toContain('https://');
    expect(html).toContain('No image');
  });

  it('shows the catalog image with a hint when there is no override', () => {
    const html = renderField({ catalogImageUrl: CENTRAL });
    expect(html).toContain(`src="${CENTRAL}"`);
    expect(html).toContain('catalog image');
    expect(html).not.toContain('Remove image');
  });

  it('shows the override with a remove button', () => {
    const html = renderField({ imageOverride: OVERRIDE, catalogImageUrl: CENTRAL });
    expect(html).toContain(`src="${OVERRIDE}"`);
    expect(html).toContain('Remove image');
  });

  it('falls back to the catalog image once the override is removed', () => {
    const html = renderField({ imageOverride: OVERRIDE, catalogImageUrl: CENTRAL, clearImage: true }, 'ar');
    expect(html).toContain(`src="${CENTRAL}"`);
    expect(html).toContain('صورة الدواء من الكتالوج');
  });
});

describe('image refusals', () => {
  it('have their own wording', () => {
    const t = i18nFor('ar').t;
    expect(productSaveErrorMessage({ code: 'INVALID_IMAGE_URL' }, t)).toBe('ارفع صورة بصيغة JPEG أو PNG أو WEBP.');
    expect(productSaveErrorMessage({ code: 'INVALID_MEDIA_TYPE' }, t)).toBe('ارفع صورة بصيغة JPEG أو PNG أو WEBP.');
  });
});
