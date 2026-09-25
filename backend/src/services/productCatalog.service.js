const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { ApiError } = require('../utils/ApiError');
const ProductCatalog = require('../models/productCatalog.model');
const { searchKey, identityKeyOf } = require('../models/productCatalog.model');
// The model, not warehouseProduct.service - this file is required BY the
// product services (for applyResolvedIdentity), so requiring one back would
// be a cycle. Models never require services, so this direction is safe.
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Manufacturer = require('../models/manufacturer.model');
const Offer = require('../models/offer.model');
const Advertisement = require('../models/advertisement.model');
const { getRate } = require('./exchangeRate.service');
const { runInTransaction } = require('../utils/transaction');
const { normalizeText } = require('../utils/normalizeText');
const { UNITS, resolveUnit } = require('../config/units');
const { fieldForHeader, IMPORT_COLUMN_SETS } = require('../config/importSynonyms');
const { parsePriceCell, resolveRowCurrency } = require('../utils/importValues');
const { parseBonus } = require('../utils/bonus');
const { loadSavedMapping, parseExplicitMapping, saveMapping } = require('./importMapping.service');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Identity resolution (Section 14 Part 2)
// ---------------------------------------------------------------------------

// A catalog-linked product's name/manufacturer live on the ProductCatalog
// entry, not on the Product itself - this resolves the display value from
// whichever place actually has it. `product.masterProductId` must already
// be `.populate()`d by the caller; a legacy product (masterProductId never
// set) falls back to its own stored fields.
function resolveProductIdentity(product) {
  const catalogItem = product.masterProductId;
  if (catalogItem && typeof catalogItem === 'object') {
    return {
      nameAr: catalogItem.nameAr,
      nameEn: catalogItem.nameEn,
      manufacturerAr: catalogItem.manufacturerAr,
      manufacturerEn: catalogItem.manufacturerEn,
    };
  }
  return {
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    manufacturerAr: product.manufacturerAr,
    manufacturerEn: product.manufacturerEn,
  };
}

// Overwrites the product doc's own name/manufacturer fields in place with
// the resolved values - presentation-only (the doc is never `.save()`d
// afterward), so every existing viewmodel that reads `product.nameAr` etc.
// keeps working unchanged regardless of whether this product is
// catalog-linked or legacy.
function applyResolvedIdentity(product) {
  const identity = resolveProductIdentity(product);
  product.nameAr = identity.nameAr;
  product.nameEn = identity.nameEn;
  product.manufacturerAr = identity.manufacturerAr;
  product.manufacturerEn = identity.manufacturerEn;
  return product;
}

// ---------------------------------------------------------------------------
// The one product search (catalog overhaul Phase 2: H1, H2, H5, L6)
// ---------------------------------------------------------------------------
//
// Every product search and filter in the app - the pharmacist catalog, the
// warehouse's product list, company drill-down and picker search, the admin's
// cross-warehouse list, and the offers pages' product match - builds its filter
// here and pages through findProductPage below. It replaced five copies of a
// two-step "regex the ProductCatalog, then $in the matching ids on Product",
// each with its own cap (one at 500, the others unbounded), plus the
// pharmacist path's fetch-and-filter-in-Node loop for the manufacturer.
//
// It queries Product directly: every product carries normalized copies of its
// identity (nameKey / nameEnKey / manufacturerKey / manufacturerEnKey,
// product.model.js), so name,
// manufacturer and category are all plain predicates on one collection - one
// query per page, whatever the distribution of the data, no id list of any
// size, nothing filtered in JavaScript.

const INVALID_QUERY_CODE = 'INVALID_QUERY_PARAM';

// A query-string value that is not a plain string (?search=a&search=b gives
// an array, ?search[x]=1 an object) is a malformed request, not a server error.
function optionalString(value, name) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Invalid ${name}.`, undefined, INVALID_QUERY_CODE);
  }
  return value;
}

// The free-text match: the normalized term as an escaped, unanchored pattern
// against the three normalized identity keys. Keys are already lowercase, so
// no 'i' flag; Arabic spelling variants meet because both sides went through
// normalizeText.
function productSearchClause(search) {
  const term = normalizeText(optionalString(search, 'search'));
  if (!term) return null;
  const pattern = new RegExp(escapeRegex(term));
  return {
    $or: [
      { nameKey: pattern },
      { nameEnKey: pattern },
      { manufacturerKey: pattern },
      { manufacturerEnKey: pattern },
    ],
  };
}

// Builds the Mongo filter.
//  - warehouseId: required for every warehouse and pharmacist caller; only the
//    admin's cross-warehouse list omits it.
//  - activeOnly (default true): isActive products only - the admin list turns
//    it off to show deactivated rows. "Off" is spelled as isActive in
//    [true, false, null] (null also matches a missing field) rather than no
//    condition, so the warehouse_manufacturer_page index (product.model.js)
//    still serves a warehouse + manufacturer filter in `_id` order.
//  - manufacturer: an EXACT company, matched on its normalized key (so a
//    spelling variant of the name still selects the company).
//  - categoryId: validated, a malformed id is a 400.
//  - availableOnly: the warehouse's "available now" picker.
function buildProductFilter({
  warehouseId,
  activeOnly = true,
  search,
  manufacturer,
  categoryId,
  availableOnly = false,
} = {}) {
  const filter = {};
  if (warehouseId) filter.warehouseId = warehouseId;
  filter.isActive = activeOnly ? true : { $in: [true, false, null] };
  if (availableOnly) filter.isAvailable = true;

  const category = optionalString(categoryId, 'category');
  if (category) {
    if (!mongoose.Types.ObjectId.isValid(category)) {
      throw ApiError.badRequest('Invalid category id.', undefined, 'INVALID_CATEGORY');
    }
    filter.categoryId = category;
  }

  const manufacturerKey = normalizeText(optionalString(manufacturer, 'manufacturer'));
  if (manufacturerKey) filter.manufacturerKey = manufacturerKey;

  const searchClause = productSearchClause(search);
  if (searchClause) filter.$or = searchClause.$or;

  return filter;
}

const PRODUCT_IDENTITY_POPULATE = {
  path: 'masterProductId',
  select: 'nameAr nameEn manufacturerAr manufacturerEn imageUrl',
};

// One page of products for a filter from buildProductFilter, cursored on `_id`
// (ascending for the pharmacist/admin lists, descending - newest first - for
// the warehouse's own). Identity is resolved after the page is read, so the
// response shape is what every viewmodel already expects.
async function findProductPage(
  filter,
  { limit, after = null, direction = 1, select = null, lean = true } = {}
) {
  const pageFilter = { ...filter };
  if (after) pageFilter._id = direction > 0 ? { $gt: after } : { $lt: after };

  let query = Product.find(pageFilter)
    .sort({ _id: direction })
    .limit(limit + 1)
    .populate(PRODUCT_IDENTITY_POPULATE);
  if (select) query = query.select(select);
  if (lean) query = query.lean();

  const rows = await query;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  page.forEach(applyResolvedIdentity);
  const nextCursor = page.length > 0 ? String(page[page.length - 1]._id) : null;
  return { rows: page, hasMore, nextCursor };
}

// ---------------------------------------------------------------------------
// List / search
// ---------------------------------------------------------------------------

const DEFAULT_CATALOG_LIMIT = 30;

// Section 14: the admin's full list, every item regardless of isActive (a
// disabled entry still needs to show up so it can be re-enabled) - as the
// admin's product list does for the warehouses' products.
//
// Cursor pagination: sorted by `_id` ascending (replacing the previous
// manufacturerAr/nameAr sort - a stable, unique cursor field is required for
// pagination to work correctly, see pagination.js).
async function listCatalog({
  search,
  categoryId,
  manufacturer,
  limit = DEFAULT_CATALOG_LIMIT,
  after = null,
} = {}) {
  // Same normalized matching as the product search above, on the catalog's
  // own keys (productCatalog.model.js).
  const filter = {};
  const category = optionalString(categoryId, 'category');
  if (category) {
    if (!mongoose.Types.ObjectId.isValid(category)) {
      throw ApiError.badRequest('Invalid category id.', undefined, 'INVALID_CATEGORY');
    }
    filter.categoryId = category;
  }
  const manufacturerKey = normalizeText(optionalString(manufacturer, 'manufacturer'));
  if (manufacturerKey) {
    filter.manufacturerKey = manufacturerKey;
  }
  const searchClause = productSearchClause(search);
  if (searchClause) {
    filter.$or = searchClause.$or;
  }
  if (after) {
    filter._id = { $gt: after };
  }

  const results = await ProductCatalog.find(filter)
    .select('-nameHistory')
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();
  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  const nextCursor = page.length > 0 ? page[page.length - 1]._id.toString() : null;

  return { items: page, hasMore, nextCursor };
}

// The warehouse's "pick a medicine from the central list" type-ahead (the Add
// product form) - active entries only, matched on the normalized Arabic or
// English name, capped so it stays a type-ahead.
async function searchActiveForWarehouse(search) {
  const filter = { isActive: true };
  const term = normalizeText(optionalString(search, 'search'));
  if (term) {
    const pattern = new RegExp(escapeRegex(term));
    filter.$or = [{ nameKey: pattern }, { nameEnKey: pattern }];
  }
  return ProductCatalog.find(filter).select('-nameHistory').sort({ nameAr: 1 }).limit(50).lean();
}

const MANUFACTURER_SEARCH_LIMIT = 50;

// Backs the admin Products/Catalog pages' manufacturer filter - a Searchable
// Dropdown rather than a plain one, since the manufacturer count isn't bounded
// the way a fixed enum's would be. Reads the central Manufacturer collection
// (one row per company, so no `distinct` over the catalog) on its normalized
// key or its English name, and returns the canonical Arabic names as before.
async function searchManufacturers(search) {
  const filter = {};
  const raw = optionalString(search, 'search');
  const term = normalizeText(raw);
  if (term) {
    filter.$or = [
      { key: new RegExp(escapeRegex(term)) },
      { nameEn: new RegExp(escapeRegex(raw.trim()), 'i') },
    ];
  }
  const rows = await Manufacturer.find(filter).select('nameAr').lean();
  const names = [...new Set(rows.map((row) => row.nameAr))];
  names.sort((a, b) => a.localeCompare(b));
  return names.slice(0, MANUFACTURER_SEARCH_LIMIT);
}

// ---------------------------------------------------------------------------
// Edit / soft-delete (no direct create - see importFromExcel below)
// ---------------------------------------------------------------------------

async function findCatalogItemOrThrow(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Catalog item not found.', 'CATALOG_ITEM_NOT_FOUND');
  }
  const item = await ProductCatalog.findById(id);
  if (!item) {
    throw ApiError.notFound('Catalog item not found.', 'CATALOG_ITEM_NOT_FOUND');
  }
  return item;
}

async function validateCategoryId(categoryId) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw ApiError.badRequest('Invalid category.', undefined, 'INVALID_CATEGORY');
  }
  const exists = await Category.exists({ _id: categoryId });
  if (!exists) {
    throw ApiError.badRequest('Invalid category.', undefined, 'INVALID_CATEGORY');
  }
}

// name/unit/category only (Section 14 Part 1) - isActive also accepted here
// so the panel's single toggle button can re-enable via PATCH, symmetric
// with DELETE for disabling (see deactivateCatalogItem).
//
// `userId` and `confirmed` exist for the rename path only. A catalog entry's
// name is resolved live wherever a product is read (applyResolvedIdentity),
// never copied onto the product, so renaming one entry renames that medicine
// in every warehouse that stocks it and in every open cart, at once. That is
// the intended design, but it used to happen with no indication of scale -
// so a rename that would touch any product is refused once, with the count,
// and only goes through on a second call carrying `confirmed`.
async function updateCatalogItem(id, changes, { userId = null, confirmed = false } = {}) {
  const item = await findCatalogItemOrThrow(id);

  // The Arabic name - the one every screen shows - is required. The English
  // name is an optional search helper (never shown): it can be set, changed
  // or cleared (null or '').
  if (changes.nameAr !== undefined && (typeof changes.nameAr !== 'string' || !changes.nameAr.trim())) {
    throw ApiError.badRequest('Invalid name.', undefined, 'INVALID_PRODUCT_NAME');
  }
  if (changes.nameEn !== undefined && changes.nameEn !== null && typeof changes.nameEn !== 'string') {
    throw ApiError.badRequest('Invalid English name.', undefined, 'INVALID_PRODUCT_NAME');
  }
  if (changes.nameAr !== undefined || changes.nameEn !== undefined) {
    const nextNameAr = changes.nameAr !== undefined ? changes.nameAr.trim() : item.nameAr;
    const nextNameEn = changes.nameEn !== undefined ? (changes.nameEn ?? '').trim() || null : item.nameEn ?? null;
    const arabicChanged = nextNameAr !== item.nameAr;
    const englishChanged = nextNameEn !== (item.nameEn ?? null);
    // Only a change to the shown (Arabic) name reaches every warehouse's
    // screens, so only that needs confirming; re-saving the form without
    // touching the name (to set a category, say) must not demand it.
    if (arabicChanged) {
      const linkedProductCount = await Product.countDocuments({
        masterProductId: item._id,
        isActive: true,
      });

      if (linkedProductCount > 0 && !confirmed) {
        throw ApiError.badRequest(
          `Renaming this medicine changes it for ${linkedProductCount} product(s) across warehouses.`,
          { linkedProductCount, currentNameAr: item.nameAr, nextNameAr },
          'CATALOG_RENAME_NEEDS_CONFIRMATION'
        );
      }
    }
    if (arabicChanged || englishChanged) {

      // Who renamed it, from what, and when - the same shape (and the same
      // reasoning) as a product's own priceHistory: the value is resolved
      // live everywhere, so without this there is no record anywhere of what
      // the medicine used to be called.
      item.nameHistory.push({
        oldNameAr: item.nameAr,
        newNameAr: nextNameAr,
        oldNameEn: item.nameEn ?? null,
        newNameEn: nextNameEn,
        changedBy: userId,
        changedAt: new Date(),
      });
      item.nameAr = nextNameAr;
      item.nameEn = nextNameEn;
    }
  }

  if (changes.unitAr !== undefined) {
    item.unitAr =
      typeof changes.unitAr === 'string' && changes.unitAr.trim() ? changes.unitAr.trim() : null;
  }

  if (changes.categoryId !== undefined) {
    if (changes.categoryId === null) {
      item.categoryId = null;
    } else {
      await validateCategoryId(changes.categoryId);
      item.categoryId = changes.categoryId;
    }
  }

  // isActive is also accepted here so the panel's single toggle button can
  // re-enable via PATCH - and turning it off here is the same recall DELETE
  // runs (recallCatalogItem below), so the two paths can never differ.
  const wasActive = item.isActive !== false;
  if (changes.isActive !== undefined) {
    item.isActive = changes.isActive === true;
  }
  const nowActive = item.isActive !== false;

  // The rename also rewrites the search keys every linked product carries a
  // copy of (product.model.js) - in the same transaction, so a search can
  // never find a product under its old name after the catalog says the new one.
  // Either name feeds the products' search keys (the English one is a search
  // helper), so either change is copied onto the linked products.
  const renamed = item.isModified('nameAr') || item.isModified('nameEn');
  let recallSummary = null;
  let restoredProductCount = 0;
  try {
    await runInTransaction(async (session) => {
      recallSummary = null;
      restoredProductCount = 0;
      await item.save({ session });
      if (renamed) {
        await Product.updateMany(
          { masterProductId: item._id },
          { $set: { nameKey: item.nameKey, nameEnKey: item.nameEnKey } },
          { session }
        );
      }
      if (wasActive && !nowActive) recallSummary = await recallLinkedProducts(item, session);
      if (!wasActive && nowActive) restoredProductCount = await restoreRecalledProducts(item, session);
    });
  } catch (err) {
    // The unique identityKey index - renaming an item onto an existing
    // name/manufacturer pair. Without this the raw E11000 became a 500, which
    // errorHandler.js masks in production as "Something went wrong", leaving
    // the admin with no idea a duplicate is what stopped them.
    if (err.code === 11000) {
      throw ApiError.conflict(
        'Another medicine already has this name for this manufacturer.',
        'CATALOG_ITEM_ALREADY_EXISTS'
      );
    }
    throw err;
  }
  if (recallSummary) announceRecall(recallSummary);
  item.restoredProductCount = restoredProductCount;
  return item;
}

// Sets or clears a catalog item's central image (a Cloudinary URL the caller
// already stored - imageAsset.service.js). Returns the previous URL so the
// caller can release it once nothing references it.
async function setCatalogImage(id, imageUrl) {
  const item = await findCatalogItemOrThrow(id);
  const previousImageUrl = item.imageUrl ?? null;
  item.imageUrl = imageUrl ?? null;
  await item.save();
  return { item, previousImageUrl };
}

// A catalog recall (catalog overhaul Phase 3.1) - what withdrawing a medicine
// from the central list does to everything built on it, inside the caller's
// transaction:
//   - every warehouse product linked to it -> isActive:false with
//     deactivatedBy 'catalog_recall', so a later reactivation knows which
//     products the recall took (and only those come back);
//   - every running or waiting offer on those products -> 'stopped' (kept as a
//     record, never live again, never restored);
//   - every package (advertisement) containing one of them loses that line and
//     otherwise stays as it is; a package left with no lines is taken off sale
//     (isAvailable:false).
// Orders already placed are untouched - each froze its lines and package terms
// at order time.
async function recallLinkedProducts(item, session) {
  const products = await Product.find({ masterProductId: item._id, isActive: true })
    .select('_id warehouseId')
    .session(session)
    .lean();
  const productIds = products.map((product) => product._id);
  const summary = {
    catalogItemId: item._id,
    deactivatedProductCount: 0,
    stoppedOffers: [],
    affectedPackages: [],
    emptiedPackageCount: 0,
  };
  if (productIds.length === 0) return summary;

  const now = new Date();
  const productResult = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { isActive: false, deactivatedBy: 'catalog_recall' } },
    { session }
  );
  summary.deactivatedProductCount = productResult.modifiedCount ?? 0;

  const offers = await Offer.find({
    $or: [{ productId: { $in: productIds } }, { 'pendingUpdate.productId': { $in: productIds } }],
    status: { $in: ['pending', 'approved'] },
  })
    .select('_id warehouseId')
    .session(session)
    .lean();
  if (offers.length > 0) {
    await Offer.updateMany(
      { _id: { $in: offers.map((offer) => offer._id) } },
      { $set: { status: 'stopped', stoppedAt: now, stoppedReason: 'catalog_recall', pendingUpdate: null } },
      { session }
    );
    summary.stoppedOffers = offers.map((offer) => ({ offerId: offer._id, warehouseId: offer.warehouseId }));
  }

  const idSet = new Set(productIds.map(String));
  const packages = await Advertisement.find({ 'items.productId': { $in: productIds } }).session(session);
  for (const advertisement of packages) {
    advertisement.items = advertisement.items.filter((line) => !idSet.has(String(line.productId)));
    if (advertisement.items.length === 0) {
      advertisement.isAvailable = false;
      summary.emptiedPackageCount += 1;
    }
    // `items` is required and may legitimately be left empty here - the
    // package is kept as a record, off sale.
    await advertisement.save({ session, validateModifiedOnly: true });
    summary.affectedPackages.push({ advertisementId: advertisement._id, warehouseId: advertisement.warehouseId });
  }

  return summary;
}

// Reactivating a catalog item (Phase 3.2): the products its recall took come
// back. Only those - a product the warehouse itself disabled keeps its
// manuallyDisabled (and so stays unavailable), and one an admin disabled
// individually (deactivatedBy 'admin') stays off. Offers the recall stopped
// and package lines it removed are NOT restored.
async function restoreRecalledProducts(item, session) {
  const result = await Product.updateMany(
    { masterProductId: item._id, isActive: false, deactivatedBy: 'catalog_recall' },
    { $set: { isActive: true, deactivatedBy: null } },
    { session }
  );
  return result.modifiedCount ?? 0;
}

// After the recall has committed: every panel showing one of the stopped
// offers or changed packages is told to re-read (signal-only realtime).
function announceRecall(summary) {
  const { emitToAdmins, emitToWarehouse, EVENTS } = require('../realtime');
  for (const { offerId, warehouseId } of summary.stoppedOffers) {
    const payload = { offerId: String(offerId), warehouseId: String(warehouseId), status: 'stopped' };
    emitToAdmins(EVENTS.OFFER_STATUS_UPDATED, payload);
    emitToWarehouse(warehouseId, EVENTS.OFFER_STATUS_UPDATED, payload);
  }
  for (const { advertisementId, warehouseId } of summary.affectedPackages) {
    const payload = { advertisementId: String(advertisementId), warehouseId: String(warehouseId) };
    emitToAdmins(EVENTS.ADVERTISEMENT_AVAILABILITY_UPDATED, payload);
    emitToWarehouse(warehouseId, EVENTS.ADVERTISEMENT_AVAILABILITY_UPDATED, payload);
  }
}

// DELETE /admin/catalog/:id - withdrawing a medicine from the central list is
// a recall (see recallLinkedProducts): the item and everything the recall
// touches change in ONE transaction, so a failure can never leave products
// live under a withdrawn item. Reversible through PATCH isActive:true, which
// brings back exactly the products this took.
async function deactivateCatalogItem(id) {
  const item = await findCatalogItemOrThrow(id);
  let summary = null;
  await runInTransaction(async (session) => {
    const fresh = await ProductCatalog.findById(item._id).session(session);
    fresh.isActive = false;
    await fresh.save({ session });
    summary = await recallLinkedProducts(fresh, session);
  });
  announceRecall(summary);
  item.isActive = false;
  return {
    item,
    deactivatedProductCount: summary.deactivatedProductCount,
    stoppedOfferCount: summary.stoppedOffers.length,
    affectedPackageCount: summary.affectedPackages.length,
    emptiedPackageCount: summary.emptiedPackageCount,
  };
}

// ---------------------------------------------------------------------------
// Excel templates
// ---------------------------------------------------------------------------
//
// Both templates are a plain table: one header row, one medicine per row, the
// company in its own column. The import does not depend on this exact shape
// (it finds the header row and reads columns in any order - see the parser
// below), so these are a convenient starting point, not a contract.

const TABLE_INSTRUCTION = 'جدول عادي: صف عناوين ثم صنف في كل صف. ترتيب الأعمدة غير مهم.';
// The central catalog has no price - a price belongs to a warehouse's product.
const INSTRUCTION_TEXT = `${TABLE_INSTRUCTION}\nالفئة اختيارية ويجب أن تطابق فئة موجودة (لا تُنشأ فئات من الاستيراد). لا سعر في القائمة المركزية: السعر يضعه كل مستودع لمنتجه.`;
const WAREHOUSE_INSTRUCTION_TEXT = `${TABLE_INSTRUCTION}\nالعملة إجبارية لكل سعر: SYP = ليرة سورية (تتحوّل للدولار حسب سعر الصرف الحالي)، USD = دولار\nالبونص مثل 10+1 (أو 10+1، 20+3). الوحدة من القائمة.`;
const TEMPLATE_VALIDATION_LAST_ROW = 2000;

async function buildTemplateWorkbook({ headers, instruction, examples, lists = {} }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog', { views: [{ rightToLeft: true }] });
  sheet.columns = headers.map((header) => ({ width: header.width }));

  // Row 1: one merged instruction row; row 2: the header; data from row 3.
  const lastColumn = String.fromCharCode(64 + headers.length);
  sheet.mergeCells(`A1:${lastColumn}1`);
  const note = sheet.getCell('A1');
  note.value = instruction;
  note.font = { italic: true, color: { argb: 'FF5A6B87' } };
  note.alignment = { wrapText: true, horizontal: 'right', readingOrder: 'rtl' };
  sheet.getRow(1).height = 58;

  const headerRow = sheet.addRow(headers.map((header) => header.text));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
  });
  for (const example of examples) sheet.addRow(headers.map((header) => example[header.key] ?? null));

  // Dropdowns (currency, unit) on the data rows, including the empty ones
  // below the examples.
  headers.forEach((header, index) => {
    const values = lists[header.key];
    if (!values) return;
    const column = String.fromCharCode(65 + index);
    sheet.dataValidations.add(`${column}3:${column}${TEMPLATE_VALIDATION_LAST_ROW}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
    });
  });
  return workbook;
}

const TEMPLATE_EXAMPLES = [
  { name: 'باراسيتامول 500 ملغ', manufacturer: 'شركة الشرق للأدوية', price: 13000, currency: 'SYP', unit: 'علبة', bonus: '10+1' },
  { name: 'أموكسيسيلين 250 ملغ', manufacturer: 'شركة الشرق للأدوية', price: 2.5, currency: 'USD', unit: 'علبة', bonus: '' },
  { name: 'فولتارين 50 ملغ', manufacturer: 'شركة سوريا فارم', price: 15000, currency: 'SYP', unit: 'شريط', bonus: '20+3' },
];

const CATALOG_TEMPLATE_EXAMPLES = [
  { name: 'باراسيتامول 500 ملغ', manufacturer: 'شركة الشرق للأدوية', category: 'مسكنات' },
  { name: 'أموكسيسيلين 250 ملغ', manufacturer: 'شركة الشرق للأدوية', category: 'صادات حيوية' },
  { name: 'فولتارين 50 ملغ', manufacturer: 'شركة سوريا فارم', category: '' },
];

// The admin's central catalog template: the import's own columns (name,
// company, optional category) - no price.
async function generateTemplateBuffer() {
  const workbook = await buildTemplateWorkbook({
    headers: [
      { key: 'name', text: 'اسم الدواء', width: 38 },
      { key: 'manufacturer', text: 'الشركة', width: 28 },
      { key: 'category', text: 'الفئة', width: 20 },
    ],
    instruction: INSTRUCTION_TEXT,
    examples: CATALOG_TEMPLATE_EXAMPLES,
  });
  return workbook.xlsx.writeBuffer();
}

// Section 14 Part 2: the warehouse's own import template - the medicine and
// company names are matched against the central catalog (spelling variants
// tolerated); anything that does not match goes to the review list.
async function generateWarehouseTemplateBuffer() {
  const workbook = await buildTemplateWorkbook({
    headers: [
      { key: 'name', text: 'اسم المادة', width: 38 },
      { key: 'manufacturer', text: 'الشركة', width: 28 },
      { key: 'price', text: 'السعر', width: 12 },
      { key: 'currency', text: 'العملة', width: 10 },
      { key: 'unit', text: 'الوحدة', width: 12 },
      { key: 'bonus', text: 'البونص', width: 14 },
    ],
    instruction: WAREHOUSE_INSTRUCTION_TEXT,
    examples: TEMPLATE_EXAMPLES,
    lists: { currency: ['USD', 'SYP'], unit: UNITS.map((unit) => unit.nameAr) },
  });
  return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Excel import - reading the file (catalog overhaul Phase 4.1-4.2)
// ---------------------------------------------------------------------------
//
// Shared by the admin's catalog import and the warehouse's product import.
// It does not assume a layout:
//  - the first worksheet that holds a product table is used;
//  - the header row is found automatically: the first ~20 rows are scored by
//    how many known column headers they contain (config/importSynonyms.js,
//    matched after normalizeText), and title rows above it are ignored;
//  - columns may come in any order;
//  - a header the synonyms do not know can be mapped by the warehouse once
//    (IMPORT_COLUMNS_UNRECOGNIZED -> the web's mapping step); the choice is
//    remembered per warehouse (ImportColumnMapping);
//  - the old template's shape (no company column - a [bracketed] or yellow
//    company row above its medicines) still reads.

const HEADER_SCAN_ROWS = 20;
const MIN_USD_PRICE = 0.01;

function cellText(cell) {
  if (!cell || cell.value == null) return '';
  const text = cell.text != null ? cell.text : cell.value;
  return String(text).trim();
}

function isYellowFill(cell) {
  const fill = cell.fill;
  return !!(fill && fill.type === 'pattern' && fill.fgColor && fill.fgColor.argb === 'FFFFFF00');
}

function companyRowName(nameText, nameCell) {
  if (nameText.startsWith('[') && nameText.endsWith(']')) return nameText.slice(1, -1).trim();
  if (isYellowFill(nameCell)) return nameText;
  return null;
}

// Which field each column of one row names, given the remembered mappings.
// A column naming a field outside the import's column set is ignored.
function mapHeaderRow(row, { explicitMapping, savedMapping, columnSet }) {
  const columns = [];
  const fieldColumns = new Map();
  const cellCount = Math.max(row.cellCount, row.actualCellCount || 0);
  for (let index = 1; index <= cellCount; index += 1) {
    const header = cellText(row.getCell(index));
    if (!header) continue;
    const headerKey = normalizeText(header);
    const named =
      (explicitMapping && explicitMapping.get(headerKey)) ||
      (savedMapping && savedMapping.get(headerKey)) ||
      fieldForHeader(header);
    const field = named && columnSet.fields.includes(named) ? named : null;
    columns.push({ index, header, headerKey, field });
    if (field && !fieldColumns.has(field)) fieldColumns.set(field, index);
  }
  return { columns, fieldColumns };
}

function hasCompanyRows(sheet, headerRowNumber, nameColumn) {
  const last = Math.min(sheet.rowCount, headerRowNumber + 200);
  for (let number = headerRowNumber + 1; number <= last; number += 1) {
    const cell = sheet.getRow(number).getCell(nameColumn);
    const text = cellText(cell);
    if (text && companyRowName(text, cell)) return true;
  }
  return false;
}

function locateTable(workbook, options) {
  let best = null;
  for (const sheet of workbook.worksheets) {
    const last = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
    for (let number = 1; number <= last; number += 1) {
      const mapped = mapHeaderRow(sheet.getRow(number), options);
      if (mapped.columns.length === 0) continue;
      const score = mapped.fieldColumns.size;
      if (!best || score > best.score) best = { sheet, headerRowNumber: number, score, ...mapped };
    }
    if (best && best.sheet === sheet && options.columnSet.required.every((field) => best.fieldColumns.has(field))) {
      return best;
    }
  }
  return best;
}

function columnsNeedMapping(located, missing, columnSet) {
  return ApiError.badRequest(
    'Some required columns could not be recognized - choose which column is which.',
    {
      missing,
      headers: (located ? located.columns : []).map(({ index, header, headerKey, field }) => ({
        index,
        header,
        headerKey,
        field,
      })),
      // The mapping step offers exactly this import's fields.
      fields: columnSet.fields,
      required: columnSet.required,
    },
    'IMPORT_COLUMNS_UNRECOGNIZED'
  );
}

// Reads the uploaded workbook into plain rows, for one import's column set
// (config/importSynonyms.js IMPORT_COLUMN_SETS - required, so the two imports
// can never share a column list by default). Throws IMPORT_COLUMNS_UNRECOGNIZED
// (with the detected headers) when a required column can't be identified.
// Price, currency, unit and bonus are only read when the set has them.
//
// Every returned row: { rowNumber, raw, name, manufacturer, category, price, priceEmpty,
// currency, unit, unitGiven, bonuses, bonusGiven, problems[] }. `problems`
// holds what the row itself got wrong - 'missing_name', 'invalid_price',
// 'missing_currency', 'unknown_currency', 'unknown_unit', 'bad_bonus'.
async function readImportWorkbook(file, { explicitMapping = null, savedMapping = null, columnSet } = {}) {
  if (!columnSet) throw new Error('readImportWorkbook needs the import\'s column set');
  if (!file) {
    throw ApiError.badRequest('No file uploaded.', undefined, 'NO_IMPORT_FILE');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    throw ApiError.badRequest('This file is not a valid Excel workbook.', undefined, 'INVALID_IMPORT_FILE');
  }
  if (workbook.worksheets.length === 0) {
    throw ApiError.badRequest('The uploaded file has no worksheet.', undefined, 'INVALID_IMPORT_FILE');
  }

  const located = locateTable(workbook, { explicitMapping, savedMapping, columnSet });
  const missing = columnSet.required.filter((field) => !located || !located.fieldColumns.has(field));
  let companyRowMode = false;
  if (missing.length === 1 && missing[0] === 'manufacturer') {
    companyRowMode = hasCompanyRows(located.sheet, located.headerRowNumber, located.fieldColumns.get('name'));
  }
  if (missing.length > 0 && !companyRowMode) throw columnsNeedMapping(located, missing, columnSet);

  const { sheet, headerRowNumber, fieldColumns, columns } = located;
  const col = (field) => fieldColumns.get(field);
  const headerKeys = new Set(columns.map((c) => c.headerKey));

  const rows = [];
  let currentCompany = null;
  for (let number = headerRowNumber + 1; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    const nameCell = row.getCell(col('name'));
    const name = cellText(nameCell);
    const values = [...fieldColumns.values()].map((index) => cellText(row.getCell(index)));
    if (values.every((value) => !value)) continue; // blank / separator row

    if (companyRowMode && name) {
      const company = companyRowName(name, nameCell);
      if (company) {
        currentCompany = company;
        continue;
      }
    }
    // A repeated header row further down the sheet (a printed report with
    // headers on every page).
    if (name && headerKeys.has(normalizeText(name)) && fieldForHeader(name) === 'name') continue;

    const priceCell = col('price') ? row.getCell(col('price')) : null;
    const rawPrice = !priceCell ? '' : typeof priceCell.value === 'number' ? priceCell.value : cellText(priceCell);
    const manufacturer = companyRowMode ? currentCompany ?? '' : cellText(row.getCell(col('manufacturer')));
    const raw = {
      name,
      manufacturer,
      category: col('category') ? cellText(row.getCell(col('category'))) : '',
      price: rawPrice === '' ? '' : String(rawPrice),
      currency: col('currency') ? cellText(row.getCell(col('currency'))) : '',
      unit: col('unit') ? cellText(row.getCell(col('unit'))) : '',
      bonus: col('bonus') ? cellText(row.getCell(col('bonus'))) : '',
    };

    const parsedRow = {
      rowNumber: number,
      raw,
      name,
      manufacturer,
      category: raw.category,
      price: null,
      priceEmpty: false,
      currency: null,
      unit: undefined,
      unitGiven: false,
      bonuses: undefined,
      bonusGiven: Boolean(col('bonus')),
      problems: [],
    };

    if (!name) parsedRow.problems.push('missing_name');

    if (col('price')) {
      const parsedPrice = parsePriceCell(rawPrice);
      if (parsedPrice.empty) {
        parsedRow.priceEmpty = true;
      } else if (parsedPrice.value === null) {
        parsedRow.problems.push('invalid_price');
      } else {
        parsedRow.price = parsedPrice.value;
        const currency = resolveRowCurrency(raw.currency, parsedPrice.currencyMarker);
        if (currency.problem) parsedRow.problems.push(currency.problem);
        else parsedRow.currency = currency.currency;
      }
    }

    if (raw.unit) {
      parsedRow.unitGiven = true;
      parsedRow.unit = resolveUnit(raw.unit);
      if (!parsedRow.unit) parsedRow.problems.push('unknown_unit');
    }

    if (parsedRow.bonusGiven) {
      const bonus = parseBonus(raw.bonus);
      if (bonus.ok) parsedRow.bonuses = bonus.tiers;
      else parsedRow.problems.push('bad_bonus');
    }

    rows.push(parsedRow);
  }

  return {
    sheetName: sheet.name,
    headerRowNumber,
    columns,
    companyRowMode,
    rows,
  };
}

// Converts every priced row to USD - SYP rows at the CURRENT exchange rate,
// fetched once for the whole file. A file with any SYP price and no usable
// rate fails whole, before anything is written. Rows whose converted price
// rounds below a cent (but above 0) get 'invalid_price'; a price of exactly 0
// stays 0 (the import creates such a product disabled).
async function priceRowsInUsd(rows) {
  const needsRate = rows.some((row) => row.price !== null && row.currency === 'SYP');
  let usdToSyp = null;
  if (needsRate) {
    const rate = await getRate();
    if (!(rate?.usdToSyp > 0)) {
      throw ApiError.badRequest(
        'سعر الصرف غير متوفر — أضف سعر الصرف من لوحة الأدمن أولاً',
        undefined,
        'EXCHANGE_RATE_UNAVAILABLE'
      );
    }
    usdToSyp = rate.usdToSyp;
  }

  let convertedFromSyp = 0;
  for (const row of rows) {
    row.priceUsd = null;
    if (row.price === null || !row.currency) continue;
    const usd =
      row.currency === 'SYP'
        ? Math.round((row.price / usdToSyp) * 100) / 100
        : Math.round(row.price * 100) / 100;
    if (row.price > 0 && usd < MIN_USD_PRICE) {
      row.problems.push('invalid_price');
      continue;
    }
    row.priceUsd = usd;
    row.exchangeRateUsed = row.currency === 'SYP' ? usdToSyp : null;
    if (row.currency === 'SYP') convertedFromSyp += 1;
  }
  return { exchangeRateUsed: usdToSyp, convertedFromSyp };
}

// ---------------------------------------------------------------------------
// Admin catalog import
// ---------------------------------------------------------------------------
//
// Upserts central-catalog items by normalized identity (name + manufacturer).
//  - Its columns are its own (IMPORT_COLUMN_SETS.catalog): name and company
//    required, category optional. The central catalog has no price - a price
//    belongs to a warehouse's product - so price, currency, unit and bonus
//    columns are ignored, and an existing item's price is never touched.
//  - A manufacturer name that matches no Manufacturer is NOT created silently:
//    its rows are skipped and listed under `newManufacturers`, and the admin
//    re-submits the file confirming it (`confirmNewManufacturers`, created
//    then) or linking it to an existing one (`manufacturerLinks`,
//    { rawName: manufacturerId }).
//  - A withdrawn (recalled) item is never reactivated - reported under
//    `withdrawn` (M1).
// `mapping` is the web's answer to IMPORT_COLUMNS_UNRECOGNIZED ({ headerKey:
// field }); it is remembered for the next catalog import once the file reads
// (the admins share one set - importMapping.service.js).
async function importFromExcel(file, { confirmNewManufacturers = [], manufacturerLinks = {}, mapping = null } = {}) {
  const columnSet = IMPORT_COLUMN_SETS.catalog;
  const explicitMapping = parseExplicitMapping(mapping, columnSet.fields);
  const savedMapping = await loadSavedMapping(null);
  const { rows } = await readImportWorkbook(file, { explicitMapping, savedMapping, columnSet });
  await saveMapping(null, explicitMapping);
  const errors = [];
  const usable = [];
  for (const row of rows) {
    // Only the name and the company can be wrong here - the catalog reads
    // nothing else that could be (no price, currency, unit or bonus).
    const rowProblems = row.problems.filter((problem) => problem === 'missing_name');
    if (!row.manufacturer) rowProblems.push('missing_manufacturer');
    if (rowProblems.length > 0) {
      errors.push({ row: row.rowNumber, reason: rowProblems.join(', '), code: rowProblems[0].toUpperCase() });
      continue;
    }
    usable.push(row);
  }

  // Manufacturers: existing by key, explicitly linked, or confirmed as new.
  const confirmedKeys = new Set((confirmNewManufacturers || []).map((name) => normalizeText(name)).filter(Boolean));
  const linkByKey = new Map();
  for (const [rawName, manufacturerId] of Object.entries(manufacturerLinks || {})) {
    if (mongoose.Types.ObjectId.isValid(manufacturerId)) linkByKey.set(normalizeText(rawName), manufacturerId);
  }
  const rawKeys = [...new Set(usable.map((row) => normalizeText(row.manufacturer)))];
  const existing = await Manufacturer.find({ key: { $in: rawKeys } }).lean();
  const manufacturerByKey = new Map(existing.map((m) => [m.key, m]));
  const linked = linkByKey.size
    ? await Manufacturer.find({ _id: { $in: [...linkByKey.values()] } }).lean()
    : [];
  const linkedById = new Map(linked.map((m) => [String(m._id), m]));

  const newManufacturers = new Map(); // key -> { name, rows }
  for (const row of usable) {
    const key = normalizeText(row.manufacturer);
    if (manufacturerByKey.has(key)) continue;
    const linkedTo = linkByKey.get(key) && linkedById.get(String(linkByKey.get(key)));
    if (linkedTo) {
      manufacturerByKey.set(key, linkedTo);
      continue;
    }
    if (confirmedKeys.has(key)) {
      const created = await Manufacturer.findOneAndUpdate(
        { key },
        { $setOnInsert: { nameAr: row.manufacturer.trim(), key } },
        { upsert: true, new: true }
      ).lean();
      manufacturerByKey.set(key, created);
      continue;
    }
    if (!newManufacturers.has(key)) newManufacturers.set(key, { name: row.manufacturer.trim(), rows: [] });
    newManufacturers.get(key).rows.push(row.rowNumber);
  }

  // The file's one name column is the item's Arabic name (the English name,
  // a search helper, is only ever set by an admin - never by this import).
  const manufacturerOf = (row) => manufacturerByKey.get(normalizeText(row.manufacturer));
  const identityOf = (row) => identityKeyOf(normalizeText(row.name), manufacturerOf(row)?.key);
  const ready = usable.filter((row) => manufacturerByKey.has(normalizeText(row.manufacturer)));
  const existingItems = await ProductCatalog.find({ identityKey: { $in: [...new Set(ready.map(identityOf))] } });
  const itemByIdentity = new Map(existingItems.map((item) => [item.identityKey, item]));
  // Categories: the file's text matched against every category's Arabic and
  // English name after normalizeText ("صادات حيوية" = "صادات حيويه"). Never
  // created here - an unknown one leaves the item without a category and is
  // listed in the report; an empty cell is simply no category.
  const categories = await Category.find({}).select('nameAr nameEn').lean();
  const categoryByKey = new Map();
  for (const category of categories) {
    for (const name of [category.nameAr, category.nameEn]) {
      const key = normalizeText(name);
      if (key && !categoryByKey.has(key)) categoryByKey.set(key, category._id);
    }
  }
  const unknownCategories = [];
  const categoryOf = (row) => {
    const text = typeof row.category === 'string' ? row.category.trim() : '';
    if (!text) return { categoryId: null, text: null };
    return { categoryId: categoryByKey.get(normalizeText(text)) ?? null, text };
  };

  let added = 0;
  // An existing item whose category the file set (updated), or that the file
  // only confirms (unchanged) - the catalog import changes nothing else.
  let updated = 0;
  let unchanged = 0;
  const withdrawn = [];
  for (const row of ready) {
    const manufacturer = manufacturerOf(row);
    const category = categoryOf(row);
    try {
      const item = itemByIdentity.get(identityOf(row));
      if (item && item.isActive === false) {
        withdrawn.push({ row: row.rowNumber, nameAr: item.nameAr });
        continue;
      }
      if (item) {
        // A known category files it there; an unknown or empty cell leaves
        // the item's category as it was.
        if (category.categoryId && String(item.categoryId) !== String(category.categoryId)) {
          item.categoryId = category.categoryId;
          await item.save();
          updated += 1;
        } else {
          unchanged += 1;
        }
        if (category.text && !category.categoryId) unknownCategories.push({ row: row.rowNumber, category: category.text });
        continue;
      }
      const created = await ProductCatalog.create({
        nameAr: row.name,
        manufacturerAr: manufacturer.nameAr,
        manufacturerId: manufacturer._id,
        categoryId: category.categoryId,
      });
      if (category.text && !category.categoryId) unknownCategories.push({ row: row.rowNumber, category: category.text });
      itemByIdentity.set(created.identityKey, created);
      added += 1;
    } catch {
      errors.push({ row: row.rowNumber, reason: 'Failed to save this row.' });
    }
  }

  return {
    added,
    updated,
    unchanged,
    withdrawn,
    newManufacturers: [...newManufacturers.values()],
    // Imported without a category: { row, category } - the file's text.
    unknownCategories,
    errors,
  };
}

module.exports = {
  listCatalog,
  searchActiveForWarehouse,
  searchManufacturers,
  updateCatalogItem,
  deactivateCatalogItem,
  recallLinkedProducts,
  setCatalogImage,
  findCatalogItemOrThrow,
  generateTemplateBuffer,
  generateWarehouseTemplateBuffer,
  importFromExcel,
  // The shared import reader, reused by the warehouse import
  // (warehouseImport.service.js).
  readImportWorkbook,
  priceRowsInUsd,
  // Every service that reads Product docs for display.
  resolveProductIdentity,
  applyResolvedIdentity,
  escapeRegex,
  // The one product search (see its section above).
  buildProductFilter,
  findProductPage,
  optionalString,
};
