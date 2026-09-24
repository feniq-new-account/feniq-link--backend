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
//    it off to show deactivated rows.
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
  if (activeOnly) filter.isActive = true;
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
// disabled entry still needs to show up so it can be re-enabled) - matches
// adminProduct.service.js's listAllProducts, which does the same for the
// per-warehouse catalog.
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

  if (changes.nameAr !== undefined) {
    if (typeof changes.nameAr !== 'string' || !changes.nameAr.trim()) {
      throw ApiError.badRequest('Invalid name.', undefined, 'INVALID_PRODUCT_NAME');
    }

    const nextName = changes.nameAr.trim();
    // Only a real change needs confirming - re-saving the form without
    // touching the name (to set a category, say) must not demand it.
    if (nextName !== item.nameAr) {
      const linkedProductCount = await Product.countDocuments({
        masterProductId: item._id,
        isActive: true,
      });

      if (linkedProductCount > 0 && !confirmed) {
        throw ApiError.badRequest(
          `Renaming this medicine changes it for ${linkedProductCount} product(s) across warehouses.`,
          { linkedProductCount, currentNameAr: item.nameAr, nextNameAr: nextName },
          'CATALOG_RENAME_NEEDS_CONFIRMATION'
        );
      }

      // Who renamed it, from what, and when - the same shape (and the same
      // reasoning) as a product's own priceHistory: the value is resolved
      // live everywhere, so without this there is no record anywhere of what
      // the medicine used to be called.
      item.nameHistory.push({
        oldNameAr: item.nameAr,
        newNameAr: nextName,
        changedBy: userId,
        changedAt: new Date(),
      });
      item.nameAr = nextName;
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
  const renamed = item.isModified('nameAr');
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
// Excel template
// ---------------------------------------------------------------------------

const HEADER_TEXT = 'اسم الدواء';
const WAREHOUSE_HEADER_TEXT = 'اسم الدواء (من القائمة)';
const PRICE_HEADER_TEXT = 'السعر';
const CURRENCY_HEADER_TEXT = 'العملة';
const NOTE_TEXT =
  'صف بخلفية صفراء = اسم الشركة، الصفوف التالية = أدويتها، صف فاضي = فاصل';
const WAREHOUSE_NOTE_TEXT =
  'صف بخلفية صفراء = اسم الشركة، الصفوف التالية = أدويتها، صف فاضي = فاصل. الأسماء لازم تطابق القائمة المركزية بالضبط.';
// Appended (on its own line) below NOTE_TEXT inside the single merged
// instruction row - see buildTemplateWorkbook. Kept a separate constant so
// KNOWN_NOTE_TEXTS can also match an older template that put it on its own
// row.
const CURRENCY_NOTE_TEXT =
  'العملة: SYP = ليرة سورية (يتحوّل تلقائياً للدولار حسب سعر الصرف الحالي)\nUSD = دولار أمريكي (يُخزَّن مباشرة)';
const MANUFACTURER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const CURRENCY_VALIDATION_LAST_ROW = 1000;

// Shared by both templates below (admin's master-list template and the
// warehouse's own import template, Section 14 Part 1 vs Part 2) - same
// three-column/company-row shape, only the header/note text and example
// rows differ.
async function buildTemplateWorkbook({ nameHeader, noteText, examples }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Catalog', { views: [{ rightToLeft: true }] });

  sheet.columns = [{ width: 42 }, { width: 14 }, { width: 12 }];

  // Row 1: a single merged instruction row - the company/medicine/separator
  // legend and the currency explanation, each on its own line. Row 2 is the
  // column header; data starts at row 3. That's exactly LEADING_ROWS_TO_SKIP
  // (= 2, see parseWorkbookRows) rows before the first real manufacturer row.
  sheet.mergeCells('A1:C1');
  const noteCell = sheet.getCell('A1');
  noteCell.value = `${noteText}\n${CURRENCY_NOTE_TEXT}`;
  noteCell.font = { italic: true, color: { argb: 'FF5A6B87' } };
  noteCell.alignment = { wrapText: true, horizontal: 'right', readingOrder: 'rtl' };
  sheet.getRow(1).height = 64;

  const headerRow = sheet.addRow([nameHeader, PRICE_HEADER_TEXT, CURRENCY_HEADER_TEXT]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
  });

  // Merges *after* adding the row, using the row's own actual number -
  // merging a predicted "next row" beforehand causes exceljs to reserve
  // that row itself, so the subsequent addRow lands one row further down
  // than intended (an unwanted extra blank row).
  function addManufacturerRow(nameAr) {
    const row = sheet.addRow([`[${nameAr}]`]);
    sheet.mergeCells(`A${row.number}:C${row.number}`);
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = MANUFACTURER_FILL;
      cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
    });
  }

  function addProductRow(nameAr, price, currency) {
    const row = sheet.addRow([nameAr, price, currency]);
    row.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' };
  }

  for (const group of examples) {
    addManufacturerRow(group.manufacturerAr);
    for (const product of group.products) {
      addProductRow(product.nameAr, product.price, product.currency);
    }
    if (group !== examples[examples.length - 1]) {
      sheet.addRow([]);
    }
  }

  // Dropdown restricted to USD/SYP, from the first real data row (row 3)
  // onward - a generous range so rows the admin/warehouse types in below
  // the examples still get it, not just the pre-filled ones.
  sheet.dataValidations.add(`C3:C${CURRENCY_VALIDATION_LAST_ROW}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"USD,SYP"'],
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'عملة غير صالحة',
    error: 'الرجاء اختيار USD أو SYP فقط.',
  });

  return workbook;
}

const ADMIN_EXAMPLES = [
  {
    manufacturerAr: 'شركة الشرق للأدوية',
    products: [
      { nameAr: 'باراسيتامول 500 ملغ', price: 13000, currency: 'SYP' },
      { nameAr: 'أموكسيسيلين 250 ملغ', price: 2.5, currency: 'USD' },
    ],
  },
  { manufacturerAr: 'شركة سوريا فارم', products: [{ nameAr: 'فولتارين 50 ملغ', price: 15000, currency: 'SYP' }] },
];

async function generateTemplateBuffer() {
  const workbook = await buildTemplateWorkbook({
    nameHeader: HEADER_TEXT,
    noteText: NOTE_TEXT,
    examples: ADMIN_EXAMPLES,
  });
  return workbook.xlsx.writeBuffer();
}

// Section 14 Part 2: the warehouse's own import template - same shape, but
// the names typed in here must match an active central-catalog entry
// exactly (case-insensitive) or the row is rejected at import time, see
// warehouseProduct.service.js's importProductsFromExcel. The example rows
// intentionally reuse the admin template's own examples, since those are
// guaranteed to exist once an admin has imported that file.
async function generateWarehouseTemplateBuffer() {
  const workbook = await buildTemplateWorkbook({
    nameHeader: WAREHOUSE_HEADER_TEXT,
    noteText: WAREHOUSE_NOTE_TEXT,
    examples: ADMIN_EXAMPLES,
  });
  return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Excel import
// ---------------------------------------------------------------------------

function cellText(cell) {
  if (cell.value == null) return '';
  return cell.text != null ? cell.text.toString().trim() : cell.value.toString().trim();
}

function isYellowFill(cell) {
  const fill = cell.fill;
  return !!(fill && fill.type === 'pattern' && fill.fgColor && fill.fgColor.argb === 'FFFFFF00');
}

function isManufacturerRow(nameText, nameCell) {
  if (nameText.startsWith('[') && nameText.endsWith(']')) return true;
  return isYellowFill(nameCell);
}

function manufacturerNameFrom(nameText) {
  return nameText.replace(/^\[/, '').replace(/\]$/, '').trim();
}

// Both templates' header/note text (admin's and the warehouse's, see
// buildTemplateWorkbook above) - a warehouse importing its own template
// needs its header/note rows recognized just as reliably as the admin's.
const KNOWN_HEADER_TEXTS = new Set([HEADER_TEXT, WAREHOUSE_HEADER_TEXT]);
// Both the standalone note strings (older templates that put the currency
// explanation on its own row) and the combined single-cell form the current
// template writes - so a note row that lands past LEADING_ROWS_TO_SKIP (a
// file with an extra hand-added title row on top) is still recognized.
const KNOWN_NOTE_TEXTS = new Set([
  NOTE_TEXT,
  WAREHOUSE_NOTE_TEXT,
  CURRENCY_NOTE_TEXT,
  `${NOTE_TEXT}\n${CURRENCY_NOTE_TEXT}`,
  `${WAREHOUSE_NOTE_TEXT}\n${CURRENCY_NOTE_TEXT}`,
]);

// The generated template has two rows before any data: one merged
// instruction row, then the column header (see buildTemplateWorkbook). Both
// are skipped by position. A real uploaded file sometimes carries an extra
// hand-added title row on top, pushing the column header down to row 3 -
// it's still caught there by content (KNOWN_HEADER_TEXTS above), so parsing
// survives that too. Only a file with two or more unrecognized rows stacked
// above the data misreads the first of them, and that costs a single
// row-level error, never the whole import.
const LEADING_ROWS_TO_SKIP = 2;

// Parses an uploaded workbook against either template's shape, but by
// content rather than fixed row positions (Section 14): a manufacturer row
// is recognized by its yellow fill OR its [bracket] text, a blank row is
// always a separator, and the note/header rows are recognized by their
// known exact text - so filling in the template (inserting/reordering rows)
// doesn't break parsing.
//
// `requirePrice` (default true, used by the warehouse products import)
// rejects a row with a missing/invalid price into `errors`. The central
// catalog import (Section 14 Part 1) passes `requirePrice: false`: the
// project owner's decision is that a priceless medicine is still worth
// having in the master list (a warehouse fills the price in later), so
// those rows become candidates with `rawPrice: null` instead of errors.
//
// Candidates carry `rawPrice`/`currency` here, not yet a converted
// `priceUsd` - the SYP-to-USD conversion needs the current exchange rate,
// an async lookup that only needs to happen once for the whole file (and
// must be able to abort the entire import before anything is written if
// the rate is missing, see resolvePricesInUsd) rather than once per row.
const MIN_SYP_PRICE = 1;
const MIN_USD_PRICE = 0.01;

function parseWorkbookRows(sheet, { requirePrice = true } = {}) {
  const candidates = [];
  const errors = [];
  const manufacturers = new Set();
  let currentManufacturer = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= LEADING_ROWS_TO_SKIP) return; // file title / instructions / column header

    const nameCell = row.getCell(1);
    const nameText = cellText(nameCell);

    if (!nameText) return; // blank/separator row
    if (KNOWN_HEADER_TEXTS.has(nameText)) return; // header row, wherever it lands
    if (KNOWN_NOTE_TEXTS.has(nameText)) return; // instruction row

    if (isManufacturerRow(nameText, nameCell)) {
      currentManufacturer = manufacturerNameFrom(nameText);
      // Every manufacturer row recognized while parsing, regardless of
      // whether any of its medicines end up as a valid candidate below -
      // the warehouse import (warehouseProduct.service.js) uses this to
      // register the manufacturer even on a file where every price
      // happened to be invalid.
      manufacturers.add(currentManufacturer);
      return;
    }

    if (!currentManufacturer) {
      errors.push({ row: rowNumber, reason: 'No manufacturer row found above this medicine yet.' });
      return;
    }

    // Currency column (row[2]). A blank cell - an old two-column file, or a
    // cleared cell in the new template - is SYP with no complaint (the
    // project owner's call: most Syrian warehouses price in lira). A value
    // that isn't USD/SYP is still handled as SYP, but recorded so the
    // importer knows it was guessed.
    const currencyText = cellText(row.getCell(3)).toUpperCase();
    let currency = 'SYP';
    if (currencyText === 'USD' || currencyText === 'SYP') {
      currency = currencyText;
    } else if (currencyText) {
      errors.push({
        row: rowNumber,
        reason: `عملة غير معروفة "${currencyText}" — تم التعامل معها كـ SYP`,
        code: 'UNKNOWN_CURRENCY',
      });
    }

    // Price column (row[1]). parseFloat (not Number) so a stray unit like
    // "13000 ل.س" still reads as 13000; a number-typed cell is taken as-is.
    const priceCell = row.getCell(2);
    const priceText = cellText(priceCell);
    const rawPrice = typeof priceCell.value === 'number' ? priceCell.value : parseFloat(priceText);

    if (priceText === '') {
      // No price at all. The warehouse import requires one; the central
      // catalog keeps the row as a priceless entry (a warehouse fills the
      // price in later - project owner's call).
      if (requirePrice) {
        errors.push({ row: rowNumber, reason: 'Missing or invalid price.', code: 'INVALID_PRICE' });
        return;
      }
      candidates.push({
        rowNumber,
        nameAr: nameText,
        manufacturerAr: currentManufacturer,
        rawPrice: null,
        currency,
      });
      return;
    }

    // Not a number (NaN), or under the floor for its currency (SYP < 1,
    // USD < 0.01). Row-level - never aborts the whole import.
    const minPrice = currency === 'USD' ? MIN_USD_PRICE : MIN_SYP_PRICE;
    if (!Number.isFinite(rawPrice) || rawPrice < minPrice) {
      errors.push({ row: rowNumber, reason: 'Invalid price.', code: 'INVALID_PRICE' });
      return;
    }

    candidates.push({
      rowNumber,
      nameAr: nameText,
      manufacturerAr: currentManufacturer,
      rawPrice,
      currency,
    });
  });

  return { candidates, errors, manufacturers: [...manufacturers] };
}

// Turns every candidate's rawPrice (in that row's own currency) into a USD
// priceUsd, fetching the exchange rate at most once for the whole file and
// only when a row actually needs it - an all-USD file imports fine with no
// rate configured at all.
//
// The rate lookup, and the EXCHANGE_RATE_UNAVAILABLE abort it can raise,
// happen here: after the (side-effect-free) row parse but before either
// import function writes a single product. A file with any SYP row and no
// usable rate fails whole, up front - never partway through.
//
// A row whose converted price rounds below the USD floor is dropped into
// `errors` and left out of the returned candidates (row-level, same as a
// bad price caught during parsing).
async function resolvePricesInUsd(candidates, errors) {
  const needsConversion = candidates.some((c) => c.rawPrice !== null && c.currency === 'SYP');

  let usdToSyp = null;
  if (needsConversion) {
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

  const priced = [];
  let convertedFromSyp = 0;

  for (const candidate of candidates) {
    if (candidate.rawPrice === null) {
      candidate.priceUsd = null; // priceless central-catalog entry, kept as-is
      priced.push(candidate);
      continue;
    }

    let priceUsd;
    if (candidate.currency === 'SYP') {
      // e.g. 13000 SYP ÷ 130 = $100.00
      priceUsd = Math.round((candidate.rawPrice / usdToSyp) * 100) / 100;
    } else {
      priceUsd = Math.round(candidate.rawPrice * 100) / 100;
    }

    if (priceUsd < MIN_USD_PRICE) {
      // A tiny SYP amount can round down to $0.00 once converted - reject it
      // with the same floor a directly-entered USD price gets.
      errors.push({ row: candidate.rowNumber, reason: 'Invalid price.', code: 'INVALID_PRICE' });
      continue;
    }

    candidate.priceUsd = priceUsd;
    if (candidate.currency === 'SYP') convertedFromSyp += 1;
    priced.push(candidate);
  }

  return { candidates: priced, exchangeRateUsed: usdToSyp, convertedFromSyp };
}

// Shared by both import endpoints (admin's catalog import and the
// warehouse's own, see warehouseProduct.service.js) - loads the uploaded
// buffer as a workbook and hands back its first sheet, already row-parsed.
// `requirePrice` is forwarded to parseWorkbookRows - see its comment above.
async function loadAndParseUpload(file, { requirePrice = true } = {}) {
  if (!file) {
    throw ApiError.badRequest('No file uploaded.', undefined, 'NO_IMPORT_FILE');
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    throw ApiError.badRequest('This file is not a valid Excel workbook.', undefined, 'INVALID_IMPORT_FILE');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw ApiError.badRequest('The uploaded file has no worksheet.', undefined, 'INVALID_IMPORT_FILE');
  }

  const { candidates, errors, manufacturers } = parseWorkbookRows(sheet, { requirePrice });
  // Pricing + the EXCHANGE_RATE_UNAVAILABLE check, both before either import
  // function below writes anything (see resolvePricesInUsd). Post-conversion
  // price failures are appended to `errors` and their rows dropped from the
  // returned candidates.
  const { candidates: pricedCandidates, exchangeRateUsed, convertedFromSyp } =
    await resolvePricesInUsd(candidates, errors);

  return {
    candidates: pricedCandidates,
    errors,
    manufacturers,
    exchangeRateUsed,
    convertedFromSyp,
  };
}

async function importFromExcel(file) {
  const { candidates, errors, exchangeRateUsed, convertedFromSyp } = await loadAndParseUpload(file, {
    requirePrice: false,
  });

  let added = 0;
  let updated = 0;
  // "Withdrawn - not reactivated" rows (see below).
  const withdrawn = [];

  for (const candidate of candidates) {
    try {
      // Upsert on (nameAr, manufacturerAr) - re-importing the same drug just
      // refreshes its price (and reactivates it) instead of duplicating. A
      // plain findOneAndUpdate({upsert:true, new:true, rawResult:true})
      // can't tell added from updated here - Mongoose returns the bare
      // document (not the {value, lastErrorObject} wrapper) once `new` is
      // combined with `rawResult`, so the two steps are kept explicit.
      // By normalized identity, not the raw display pair: a re-import that
      // spells the name or company slightly differently is the same medicine.
      const existing = await ProductCatalog.findOne({
        identityKey: identityKeyOf(searchKey(candidate.nameAr), searchKey(candidate.manufacturerAr)),
      });
      if (existing && existing.isActive === false) {
        // A withdrawn (recalled) medicine is never brought back by a
        // re-import (M1) - an old file still listing it must not undo a
        // recall. Nothing about it is changed; the row is reported instead,
        // and only an explicit PATCH isActive:true reactivates it.
        withdrawn.push({ row: candidate.rowNumber, nameAr: existing.nameAr });
      } else if (existing) {
        // A blank price on the file never erases a price the item already
        // has - only a real number (re)sets it. Leaves the field untouched
        // rather than nulling out a price a warehouse already filled in.
        if (candidate.priceUsd !== null) {
          existing.priceUsd = candidate.priceUsd;
        }
        await existing.save();
        updated += 1;
      } else {
        await ProductCatalog.create({
          nameAr: candidate.nameAr,
          manufacturerAr: candidate.manufacturerAr,
          priceUsd: candidate.priceUsd, // may be null - project owner's call, see parseWorkbookRows
        });
        added += 1;
      }
    } catch (err) {
      errors.push({ row: candidate.rowNumber, reason: 'Failed to save this row.' });
    }
  }

  return { added, updated, withdrawn, errors, exchangeRateUsed, convertedFromSyp };
}

module.exports = {
  listCatalog,
  searchActiveForWarehouse,
  searchManufacturers,
  updateCatalogItem,
  deactivateCatalogItem,
  generateTemplateBuffer,
  generateWarehouseTemplateBuffer,
  importFromExcel,
  // Reused by warehouseProduct.service.js for its own import (Section 14
  // Part 2) and by every service that reads Product docs for display.
  loadAndParseUpload,
  resolveProductIdentity,
  applyResolvedIdentity,
  escapeRegex,
  // The one product search (see its section above).
  buildProductFilter,
  findProductPage,
  optionalString,
};
