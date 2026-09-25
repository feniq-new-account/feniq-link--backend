import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18next from 'i18next';
import en from '../locales/en/translation.json';
import ar from '../locales/ar/translation.json';
import { api, ApiError } from '../api/client';
import { mergeCategoryWithConfirmation } from './AdminCategoriesPage';
import { ImportResultModal } from './AdminCatalogPage';

// Categories the catalog import creates are listed in its report, then
// renamed or merged on the Categories screen - a merge only after the admin
// has seen how many items move.

const details = {
  catalogItemCount: 4,
  productCount: 2,
  source: { id: 's', nameAr: 'مسكنات الألم', nameEn: 'Pain relief' },
  target: { id: 't', nameAr: 'مسكنات', nameEn: 'Painkillers' },
};

describe('merging one category into another', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks first with the counts the server sent, then sends the confirmed merge', async () => {
    const calls = [];
    vi.spyOn(api, 'mergeCategory').mockImplementation(async (targetId, sourceId, options) => {
      calls.push([targetId, sourceId, options?.confirmed ?? false]);
      if (!options?.confirmed) throw new ApiError('confirm', 400, 'CATEGORY_MERGE_NEEDS_CONFIRMATION', details);
      return { moved: { catalogItems: 4, products: 2 } };
    });
    const confirm = vi.fn(() => true);
    const result = await mergeCategoryWithConfirmation('t', 's', confirm);
    expect(confirm).toHaveBeenCalledWith(details);
    expect(calls).toEqual([
      ['t', 's', false],
      ['t', 's', true],
    ]);
    expect(result.moved).toEqual({ catalogItems: 4, products: 2 });
  });

  it('sends nothing more when the admin says no', async () => {
    const spy = vi.spyOn(api, 'mergeCategory').mockRejectedValue(
      new ApiError('confirm', 400, 'CATEGORY_MERGE_NEEDS_CONFIRMATION', details)
    );
    expect(await mergeCategoryWithConfirmation('t', 's', () => false)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes any other refusal through without asking', async () => {
    vi.spyOn(api, 'mergeCategory').mockRejectedValue(new ApiError('nope', 404, 'CATEGORY_NOT_FOUND'));
    const confirm = vi.fn();
    await expect(mergeCategoryWithConfirmation('t', 's', confirm)).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    expect(confirm).not.toHaveBeenCalled();
  });
});

function renderReport(report, lng = 'en') {
  const i18n = i18next.createInstance();
  i18n.use(initReactI18next).init({
    lng,
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ImportResultModal
        report={{ added: 5, updated: 0, unchanged: 0, errors: [], withdrawn: [], newManufacturers: [], ...report }}
        fileName="catalog.xlsx"
        onClose={() => {}}
        onConfirmNewManufacturers={() => {}}
        isImporting={false}
      />
    </I18nextProvider>
  );
}

describe('the catalog import report', () => {
  const newCategories = [
    { id: 'a', nameAr: 'مكملات غذائية', items: 3 },
    { id: 'b', nameAr: 'Vitamins', items: 1 },
  ];

  it('lists each category the import created with how many items it got', () => {
    const html = renderReport({ newCategories });
    expect(html).toContain('New categories created');
    expect(html).toContain('مكملات غذائية (3 items)');
    expect(html).toContain('Vitamins (1 item)');
    expect(html).not.toContain('Unknown category');
    const arabic = renderReport({ newCategories }, 'ar');
    expect(arabic).toContain('فئات جديدة أُنشئت');
    expect(arabic).toContain('مكملات غذائية (3 أصناف)');
    expect(arabic).toContain('Vitamins (صنف واحد)');
  });

  it('shows no such section when the import created none', () => {
    expect(renderReport({ newCategories: [] })).not.toContain('New categories created');
    expect(renderReport({})).not.toContain('New categories created');
  });
});
