import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { CATALOG_IMPORT_COLUMNS, ImportColumnMappingModal, WAREHOUSE_IMPORT_COLUMNS } from './ImportColumnMappingModal';

// Each Excel import has its own columns: the admin's central catalog has no
// price (name and company required, category optional); the warehouse's price
// list keeps name, price and company required.

function render(props) {
  const i18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ImportColumnMappingModal onSubmit={() => {}} onClose={() => {}} isSubmitting={false} {...props} />
    </I18nextProvider>
  );
}

const optionValues = (html) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
const headers = [{ index: 1, header: 'Mystery', headerKey: 'mystery', field: null }];

describe('the column-mapping step', () => {
  it('offers the admin catalog import its own columns and no price', () => {
    // As the server sends it for the catalog import...
    const fromServer = render({ details: { headers, ...CATALOG_IMPORT_COLUMNS, missing: ['manufacturer'] }, columns: CATALOG_IMPORT_COLUMNS });
    expect([...new Set(optionValues(fromServer))]).toEqual(['name', 'manufacturer', 'category', 'activeIngredient', 'strength', 'form']);
    // ...and as the admin page's fallback, should a refusal carry no fields.
    const fallback = render({ details: { headers }, columns: CATALOG_IMPORT_COLUMNS });
    expect([...new Set(optionValues(fallback))]).toEqual(['name', 'manufacturer', 'category', 'activeIngredient', 'strength', 'form']);
    expect(fallback).not.toContain('Price');
  });

  it('keeps the warehouse import on name, price and company (required) plus its optional columns', () => {
    expect(WAREHOUSE_IMPORT_COLUMNS.required).toEqual(['name', 'price', 'manufacturer']);
    const html = render({ details: { headers } });
    expect([...new Set(optionValues(html))]).toEqual(['name', 'price', 'manufacturer', 'unit', 'currency', 'bonus']);
  });
});
