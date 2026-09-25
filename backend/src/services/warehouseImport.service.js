const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { normalizeText } = require('../utils/normalizeText');
const { trigramSimilarity } = require('../utils/fuzzy');
const { normalizeBonusTiers } = require('../utils/bonus');
const { parsePriceCell } = require('../utils/importValues');
const { UNIT_CODES, unitNameAr, unitNameEn } = require('../config/units');
const Product = require('../models/product.model');
const ProductCatalog = require('../models/productCatalog.model');
const { identityKeyOf } = require('../models/productCatalog.model');
const Manufacturer = require('../models/manufacturer.model');
const WarehouseProductAlias = require('../models/warehouseProductAlias.model');
const ImportBatch = require('../models/importBatch.model');
const ImportBatchRow = require('../models/importBatchRow.model');
const { loadSavedMapping, parseExplicitMapping, saveMapping } = require('./importMapping.service');
const CatalogRequest = require('../models/catalogRequest.model');
const { readImportWorkbook, priceRowsInUsd, escapeRegex } = require('./productCatalog.service');
const { registerManufacturers } = require('./warehouseManufacturer.service');
const { getRate } = require('./exchangeRate.service');

// The warehouse's Excel import (catalog overhaul Phase 4): matching each row to
// the central catalog, writing the products, and keeping every row's outcome
// in an ImportBatch the warehouse can come back to (the results page).
//
// Row outcomes (ImportBatchRow.bucket):
//   added / updated / added_disabled (price 0) / blocked (disabled by the
//   admin or withdrawn - nothing changed) / review (needs the warehouse) /
//   error (unreadable).
//
// Matching, in order: (1) the warehouse's remembered alias for this exact raw
// spelling; (2) the manufacturer text resolved to a Manufacturer by normalized
// key, then the catalog item with that normalized name under it; (3) review,
// with the top-5 suggestions. Unit and bonus never take part in matching.

const PRICE_HISTORY_LIMIT = 50;
const SUGGESTION_LIMIT = 5;
const SUGGESTION_CANDIDATES = 300;
// Suggestions are computed up front for this many review rows; the rest get
// them from the live search on the results page.
const SUGGESTION_ROWS_UP_FRONT = 500;

const ERROR_REASONS = new Set(['missing_name', 'invalid_price']);
const REVIEW_PROBLEMS = new Set(['missing_currency', 'unknown_currency', 'unknown_unit', 'bad_bonus']);

// ---------------------------------------------------------------------------
// Suggestions (Phase 4.4)
// ---------------------------------------------------------------------------
//
// No external search engine: candidates come from bounded, indexed queries -
// the active items of the same manufacturer (or of manufacturers whose key
// starts the same way), then items whose normalized name starts with one of
// the row's tokens - and are scored in memory with trigram similarity on the
// name, plus a bonus when the manufacturer matches.

// A file's manufacturer text -> Manufacturer: its normalized Arabic name
// (`key`) first, else its English name (`enKey`) when exactly one company has
// that English name - two companies sharing it resolve to neither, never to a
// guess.
function manufacturerResolver(manufacturers) {
  const byKey = new Map(manufacturers.map((m) => [m.key, m]));
  const byEnKey = new Map();
  for (const m of manufacturers) {
    if (!m.enKey) continue;
    if (!byEnKey.has(m.enKey)) byEnKey.set(m.enKey, []);
    byEnKey.get(m.enKey).push(m);
  }
  return (key) => {
    if (!key) return null;
    if (byKey.has(key)) return byKey.get(key);
    const english = byEnKey.get(key);
    return english && english.length === 1 ? english[0] : null;
  };
}

async function candidateManufacturers(manufacturerKey) {
  if (!manufacturerKey) return [];
  const exact = await Manufacturer.find({ $or: [{ key: manufacturerKey }, { enKey: manufacturerKey }] })
    .select('_id key enKey')
    .lean();
  const resolved = manufacturerResolver(exact)(manufacturerKey);
  if (resolved) return [resolved];
  const prefix = new RegExp(`^${escapeRegex(manufacturerKey.slice(0, Math.min(4, manufacturerKey.length)))}`);
  const similar = await Manufacturer.find({ $or: [{ key: prefix }, { enKey: prefix }] })
    .select('_id key enKey')
    .limit(20)
    .lean();
  return similar.filter(
    (m) => trigramSimilarity(m.key, manufacturerKey) >= 0.5 || (m.enKey && trigramSimilarity(m.enKey, manufacturerKey) >= 0.5)
  );
}

// Arabic or English alike: the typed name is compared with both of an item's
// names (the English one is kept for exactly this), and the manufacturer with
// both of its names. Only the Arabic names are returned for display.
async function suggestCatalogItems({ name, manufacturer, limit = SUGGESTION_LIMIT } = {}) {
  const nameKey = normalizeText(name);
  if (!nameKey) return [];
  const manufacturerKey = normalizeText(manufacturer);
  const manufacturers = await candidateManufacturers(manufacturerKey);
  const manufacturerIds = manufacturers.map((m) => m._id);

  const select = 'nameAr nameKey nameEnKey manufacturerAr manufacturerKey manufacturerEnKey manufacturerId';
  const tokens = [...new Set(nameKey.split(' ').filter((token) => token.length >= 2))].slice(0, 4);
  const queries = [];
  if (manufacturerIds.length) {
    queries.push(
      ProductCatalog.find({ isActive: true, manufacturerId: { $in: manufacturerIds } })
        .select(select)
        .limit(SUGGESTION_CANDIDATES)
        .lean()
    );
  }
  if (tokens.length) {
    queries.push(
      ProductCatalog.find({
        isActive: true,
        $or: tokens.flatMap((token) => {
          const prefix = new RegExp(`^${escapeRegex(token.slice(0, 4))}`);
          return [{ nameKey: prefix }, { nameEnKey: prefix }];
        }),
      })
        .select(select)
        .limit(SUGGESTION_CANDIDATES)
        .lean()
    );
  }
  const results = (await Promise.all(queries)).flat();

  const idSet = new Set(manufacturerIds.map(String));
  const seen = new Set();
  const scored = [];
  for (const item of results) {
    const id = String(item._id);
    if (seen.has(id)) continue;
    seen.add(id);
    let score = 0;
    for (const itemKey of [item.nameKey, item.nameEnKey]) {
      if (itemKey) score = Math.max(score, trigramSimilarity(itemKey, nameKey));
    }
    const manufacturerNear = (itemKey) => itemKey && trigramSimilarity(itemKey, manufacturerKey) >= 0.6;
    if (idSet.has(String(item.manufacturerId))) score += 0.15;
    else if (manufacturerKey && (manufacturerNear(item.manufacturerKey) || manufacturerNear(item.manufacturerEnKey))) score += 0.1;
    scored.push({
      masterProductId: item._id,
      nameAr: item.nameAr,
      manufacturerAr: item.manufacturerAr,
      score: Math.round(Math.min(score, 1) * 100) / 100,
    });
  }
  return scored
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// The one product write (import, review resolution, catalog-request approval)
// ---------------------------------------------------------------------------
//
// Given this warehouse's existing product for a catalog item (or none) and the
// new price/unit/bonus, returns the bulkWrite operation and its outcome:
//   - existing, switched off by the platform (recall / admin) -> { blockedCode }
//     and no write at all;
//   - price 0 -> created/updated as disabled by the warehouse
//     (manuallyDisabled) - 'added_disabled' - so it can enable it later;
//   - existing -> 'updated': price (with a history entry carrying the rate a
//     SYP price was converted at), unit/bonus when given, and a product the
//     warehouse had disabled itself comes back on;
//   - none -> 'added'.
// `unitGiven` false leaves the unit alone; `bonusGiven` true with an empty
// list clears the bonus (an empty bonus cell).
function buildProductWrite({
  existing,
  catalogItem,
  warehouseId,
  userId,
  priceUsd,
  exchangeRateUsed = null,
  unit,
  unitGiven = false,
  bonuses,
  bonusGiven = false,
  now = new Date(),
}) {
  if (existing && existing.isActive === false) {
    return {
      blockedCode: existing.deactivatedBy === 'catalog_recall' ? 'CATALOG_ITEM_WITHDRAWN' : 'PRODUCT_DISABLED_BY_ADMIN',
    };
  }
  const zeroPrice = priceUsd === 0;
  const unitFields = unitGiven && unit ? { unit, unitAr: unitNameAr(unit), unitEn: unitNameEn(unit) } : {};
  const bonusFields = bonusGiven ? { bonuses: bonuses ?? [] } : {};

  if (existing) {
    const set = { ...unitFields, ...bonusFields };
    const update = {};
    if (priceUsd !== existing.price) {
      set.price = priceUsd;
      set.lastPriceUpdate = now;
      update.$push = {
        priceHistory: {
          $each: [{ oldPrice: existing.price, newPrice: priceUsd, changedBy: userId, changedAt: now, exchangeRateUsed }],
          $slice: -PRICE_HISTORY_LIMIT,
        },
      };
    }
    if (zeroPrice) {
      set.manuallyDisabled = true;
      set.isAvailable = false;
    } else if (existing.manuallyDisabled) {
      set.manuallyDisabled = false;
      set.isAvailable = true;
    }
    set.updatedAt = now;
    update.$set = set;
    // Keeps the optimistic-concurrency version honest: a form that loaded
    // this product before the import can no longer save over it unnoticed.
    update.$inc = { __v: 1 };
    return {
      productId: existing._id,
      outcome: zeroPrice ? 'added_disabled' : 'updated',
      op: { updateOne: { filter: { _id: existing._id, isActive: true }, update } },
    };
  }

  const _id = new mongoose.Types.ObjectId();
  return {
    productId: _id,
    outcome: zeroPrice ? 'added_disabled' : 'added',
    op: {
      insertOne: {
        document: {
          _id,
          warehouseId,
          masterProductId: catalogItem._id,
          // A bulk write skips product.model.js's pre-validate hook, so the
          // denormalized search keys are copied from the catalog item here.
          nameKey: catalogItem.nameKey,
          nameEnKey: catalogItem.nameEnKey ?? null,
          manufacturerKey: catalogItem.manufacturerKey,
          manufacturerEnKey: catalogItem.manufacturerEnKey ?? null,
          manufacturerId: catalogItem.manufacturerId ?? null,
          categoryId: catalogItem.categoryId ?? null,
          price: priceUsd,
          ...unitFields,
          bonuses: bonuses ?? [],
          manuallyDisabled: zeroPrice,
          isAvailable: !zeroPrice,
          isActive: true,
          deactivatedBy: null,
          lastPriceUpdate: now,
          priceHistory: [],
          createdAt: now,
          updatedAt: now,
          __v: 0,
        },
      },
    },
  };
}

const CATALOG_ITEM_SELECT = 'nameAr nameKey nameEnKey manufacturerAr manufacturerKey manufacturerEnKey manufacturerId categoryId isActive';
const EXISTING_PRODUCT_SELECT = 'masterProductId price isActive deactivatedBy manuallyDisabled';

// ---------------------------------------------------------------------------
// The import itself
// ---------------------------------------------------------------------------

function rowRecord(batchId, warehouseId, row, extra) {
  return {
    batchId,
    warehouseId,
    rowNumber: row.rowNumber,
    raw: row.raw,
    parsed: {
      priceUsd: row.priceUsd ?? null,
      currency: row.currency ?? null,
      unit: row.unit ?? null,
      bonuses: row.bonuses,
      bonusGiven: row.bonusGiven,
    },
    ...extra,
  };
}

async function importWarehouseFile(warehouseId, userId, file, { mapping = null } = {}) {
  const explicitMapping = parseExplicitMapping(mapping);
  const savedMapping = await loadSavedMapping(warehouseId);
  const { rows } = await readImportWorkbook(file, { explicitMapping, savedMapping });
  // Remembered only once the file actually read with it.
  await saveMapping(warehouseId, explicitMapping);

  // 1. Unreadable rows, and the row-level problems that need the warehouse.
  const errorRows = [];
  const candidates = [];
  for (const row of rows) {
    const reasons = row.problems.filter((p) => ERROR_REASONS.has(p));
    if (row.priceEmpty) reasons.push('missing_price');
    if (!row.manufacturer) reasons.push('missing_manufacturer');
    if (reasons.length > 0) {
      errorRows.push({ row, reasons });
      continue;
    }
    row.reviewReasons = row.problems.filter((p) => REVIEW_PROBLEMS.has(p));
    candidates.push(row);
  }
  const { exchangeRateUsed, convertedFromSyp } = await priceRowsInUsd(candidates);
  // A price that converted below a cent is unreadable too.
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (candidates[i].problems.includes('invalid_price')) {
      errorRows.push({ row: candidates[i], reasons: ['invalid_price'] });
      candidates.splice(i, 1);
    }
  }

  // 2. Matching: aliases, manufacturers, catalog items - three bounded queries.
  //
  // A row's name (the file's one name column) is an exact match on either of
  // a catalog item's names, normalized - its Arabic name, or its English name,
  // kept for exactly this - under the row's manufacturer, which itself
  // resolves by its Arabic or English name. Anything looser is a suggestion,
  // never a match.
  for (const row of candidates) {
    row.rawNameKey = normalizeText(row.name);
    row.rawManufacturerKey = normalizeText(row.manufacturer);
  }
  const allNameKeys = [...new Set(candidates.map((r) => r.rawNameKey).filter(Boolean))];
  const allManufacturerKeys = [...new Set(candidates.map((r) => r.rawManufacturerKey).filter(Boolean))];
  const [aliases, manufacturers] = await Promise.all([
    WarehouseProductAlias.find({ warehouseId, rawNameKey: { $in: allNameKeys } })
      .select('rawNameKey rawManufacturerKey masterProductId')
      .lean(),
    Manufacturer.find({ $or: [{ key: { $in: allManufacturerKeys } }, { enKey: { $in: allManufacturerKeys } }] })
      .select('key enKey nameAr')
      .lean(),
  ]);
  const aliasByPair = new Map(aliases.map((a) => [`${a.rawNameKey}|${a.rawManufacturerKey}`, a.masterProductId]));
  const resolveManufacturer = manufacturerResolver(manufacturers);

  const identities = new Set();
  const aliasTargets = new Set();
  const manufacturerIds = new Set();
  for (const row of candidates) {
    // An alias answers for the exact text the file used.
    const aliasTarget = aliasByPair.get(`${row.rawNameKey}|${row.rawManufacturerKey}`);
    if (aliasTarget) {
      row.aliasTarget = aliasTarget;
      aliasTargets.add(String(aliasTarget));
      continue;
    }
    row.manufacturerDoc = resolveManufacturer(row.rawManufacturerKey);
    if (row.manufacturerDoc) {
      manufacturerIds.add(String(row.manufacturerDoc._id));
      identities.add(identityKeyOf(row.rawNameKey, row.manufacturerDoc.key));
    }
  }
  const catalogItems = await ProductCatalog.find({
    $or: [
      { identityKey: { $in: [...identities] } },
      { _id: { $in: [...aliasTargets] } },
      { manufacturerId: { $in: [...manufacturerIds] }, nameEnKey: { $in: allNameKeys } },
    ],
  })
    .select(`${CATALOG_ITEM_SELECT} identityKey`)
    .lean();
  const itemById = new Map(catalogItems.map((item) => [String(item._id), item]));
  const itemByIdentity = new Map(catalogItems.map((item) => [item.identityKey, item]));
  const itemByEnglishName = new Map(
    catalogItems.filter((item) => item.nameEnKey).map((item) => [`${item.nameEnKey}|${item.manufacturerId}`, item])
  );

  for (const row of candidates) {
    if (row.aliasTarget) {
      row.catalogItem = itemById.get(String(row.aliasTarget));
    } else if (row.manufacturerDoc) {
      const manufacturer = row.manufacturerDoc;
      row.catalogItem =
        itemByIdentity.get(identityKeyOf(row.rawNameKey, manufacturer.key)) ??
        itemByEnglishName.get(`${row.rawNameKey}|${manufacturer._id}`) ??
        null;
    } else {
      row.catalogItem = null;
    }
    if (!row.catalogItem) {
      row.reviewReasons.push(row.manufacturerDoc || row.aliasTarget ? 'not_matched' : 'unknown_manufacturer');
    }
  }

  // 3. The same catalog item twice in one file: every such row goes to review
  // and the warehouse picks which price to keep.
  const rowsByItem = new Map();
  for (const row of candidates) {
    if (!row.catalogItem) continue;
    const key = String(row.catalogItem._id);
    if (!rowsByItem.has(key)) rowsByItem.set(key, []);
    rowsByItem.get(key).push(row);
  }
  for (const group of rowsByItem.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      row.reviewReasons.push('duplicate_in_file');
      row.duplicateOf = row.catalogItem._id;
    }
  }

  // 4. This warehouse's existing products for the matched items.
  const matchedItemIds = [...rowsByItem.keys()];
  const existingProducts = matchedItemIds.length
    ? await Product.find({ warehouseId, masterProductId: { $in: matchedItemIds } }).select(EXISTING_PRODUCT_SELECT).lean()
    : [];
  const existingByItem = new Map(existingProducts.map((p) => [String(p.masterProductId), p]));

  // 5. Outcomes and writes.
  const batchId = new mongoose.Types.ObjectId();
  const now = new Date();
  const records = [];
  const operations = [];
  const operationRecords = [];

  for (const { row, reasons } of errorRows) {
    records.push(rowRecord(batchId, warehouseId, row, { bucket: 'error', reasons }));
  }

  let suggestionBudget = SUGGESTION_ROWS_UP_FRONT;
  for (const row of candidates) {
    const item = row.catalogItem;
    if (item && item.isActive === false) {
      records.push(
        rowRecord(batchId, warehouseId, row, {
          bucket: 'blocked',
          blockedCode: 'CATALOG_ITEM_WITHDRAWN',
          masterProductId: item._id,
        })
      );
      continue;
    }
    if (row.reviewReasons.length > 0) {
      let suggestions = [];
      if (!item && suggestionBudget > 0) {
        suggestionBudget -= 1;
        suggestions = await suggestCatalogItems({ name: row.name, manufacturer: row.manufacturer });
      }
      records.push(
        rowRecord(batchId, warehouseId, row, {
          bucket: 'review',
          reasons: [...new Set(row.reviewReasons)],
          suggestions,
          masterProductId: item ? item._id : null,
          duplicateOf: row.duplicateOf ?? null,
        })
      );
      continue;
    }

    const write = buildProductWrite({
      existing: existingByItem.get(String(item._id)),
      catalogItem: item,
      warehouseId,
      userId,
      priceUsd: row.priceUsd,
      exchangeRateUsed: row.exchangeRateUsed ?? null,
      unit: row.unit,
      unitGiven: row.unitGiven,
      bonuses: row.bonuses,
      bonusGiven: row.bonusGiven,
      now,
    });
    if (write.blockedCode) {
      records.push(
        rowRecord(batchId, warehouseId, row, {
          bucket: 'blocked',
          blockedCode: write.blockedCode,
          masterProductId: item._id,
          productId: existingByItem.get(String(item._id))._id,
        })
      );
      continue;
    }
    const record = rowRecord(batchId, warehouseId, row, {
      bucket: write.outcome,
      masterProductId: item._id,
      productId: write.productId,
    });
    records.push(record);
    operations.push(write.op);
    operationRecords.push(record);
  }

  // Row-level independence: each row is its own outcome, so a row that fails
  // to save (a concurrent import of the same file, say) is reported and the
  // rest still land - one bulk write, unordered, not one transaction.
  if (operations.length > 0) {
    try {
      await Product.bulkWrite(operations, { ordered: false });
    } catch (err) {
      if (!err.writeErrors) throw err;
      for (const writeError of err.writeErrors) {
        const record = operationRecords[writeError.index];
        if (!record) continue;
        record.bucket = 'error';
        record.reasons = ['save_failed'];
        record.productId = null;
      }
    }
  }

  const matchedManufacturerNames = candidates.filter((r) => r.catalogItem).map((r) => r.catalogItem.manufacturerAr);
  if (matchedManufacturerNames.length > 0) await registerManufacturers(warehouseId, matchedManufacturerNames);

  const counts = { added: 0, updated: 0, addedDisabled: 0, blocked: 0, review: 0, resolved: 0, errors: 0 };
  const countKey = { added: 'added', updated: 'updated', added_disabled: 'addedDisabled', blocked: 'blocked', review: 'review', error: 'errors' };
  for (const record of records) counts[countKey[record.bucket]] += 1;

  const batch = await ImportBatch.create({
    _id: batchId,
    warehouseId,
    fileName: file.originalname ?? null,
    uploadedBy: userId,
    exchangeRateUsed,
    counts,
  });
  records.sort((a, b) => a.rowNumber - b.rowNumber);
  for (let start = 0; start < records.length; start += 1000) {
    await ImportBatchRow.insertMany(records.slice(start, start + 1000), { ordered: false });
  }

  return { batch, counts, exchangeRateUsed, convertedFromSyp };
}

// ---------------------------------------------------------------------------
// Batches and rows (the results page)
// ---------------------------------------------------------------------------

async function findOwnedBatchOrThrow(warehouseId, batchId) {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw ApiError.notFound('Import not found.', 'IMPORT_BATCH_NOT_FOUND');
  }
  const batch = await ImportBatch.findOne({ _id: batchId, warehouseId });
  if (!batch) throw ApiError.notFound('Import not found.', 'IMPORT_BATCH_NOT_FOUND');
  return batch;
}

async function listImportBatches(warehouseId, { limit = 20, after = null } = {}) {
  const filter = { warehouseId };
  if (after) filter._id = { $lt: after };
  const rows = await ImportBatch.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, hasMore, nextCursor: page.length ? String(page[page.length - 1]._id) : null };
}

const BUCKETS = new Set(ImportBatchRow.IMPORT_ROW_BUCKETS);

async function listImportRows(warehouseId, batchId, { bucket, limit = 50, after = null } = {}) {
  await findOwnedBatchOrThrow(warehouseId, batchId);
  if (bucket !== undefined && (typeof bucket !== 'string' || !BUCKETS.has(bucket))) {
    throw ApiError.badRequest('Invalid bucket.', undefined, 'INVALID_QUERY_PARAM');
  }
  const filter = { batchId, warehouseId };
  if (bucket) filter.bucket = bucket;
  if (after) filter._id = { $gt: after };
  const rows = await ImportBatchRow.find(filter).sort({ _id: 1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, hasMore, nextCursor: page.length ? String(page[page.length - 1]._id) : null };
}

// ---------------------------------------------------------------------------
// Resolving a review row
// ---------------------------------------------------------------------------

async function findReviewRowOrThrow(warehouseId, batchId, rowId, session = null) {
  if (!mongoose.Types.ObjectId.isValid(rowId)) {
    throw ApiError.notFound('Import row not found.', 'IMPORT_ROW_NOT_FOUND');
  }
  const row = await ImportBatchRow.findOne({ _id: rowId, batchId, warehouseId }).session(session);
  if (!row) throw ApiError.notFound('Import row not found.', 'IMPORT_ROW_NOT_FOUND');
  if (row.bucket !== 'review') {
    throw ApiError.conflict('This row has already been resolved.', 'IMPORT_ROW_ALREADY_RESOLVED');
  }
  return row;
}

// The price/unit/bonus to apply when resolving: whatever the warehouse sent
// (a fixed price or currency, a chosen unit, a corrected bonus), otherwise
// what the row parsed. A row whose price could not be read needs one.
async function resolutionValues(row, body) {
  let priceUsd = row.parsed.priceUsd;
  let exchangeRateUsed = null;
  if (body.priceUsd !== undefined) {
    if (typeof body.priceUsd !== 'number' || !Number.isFinite(body.priceUsd) || body.priceUsd < 0) {
      throw ApiError.badRequest('Invalid price.', undefined, 'INVALID_PRICE');
    }
    priceUsd = Math.round(body.priceUsd * 100) / 100;
  } else if (body.currency === 'SYP' || body.currency === 'USD') {
    const parsed = parsePriceCell(row.raw.price);
    if (parsed.value === null) throw ApiError.badRequest('Invalid price.', undefined, 'INVALID_PRICE');
    if (body.currency === 'SYP') {
      const rate = await getRate();
      if (!(rate?.usdToSyp > 0)) {
        throw ApiError.badRequest('Exchange rate is not available.', undefined, 'EXCHANGE_RATE_UNAVAILABLE');
      }
      priceUsd = Math.round((parsed.value / rate.usdToSyp) * 100) / 100;
      exchangeRateUsed = rate.usdToSyp;
    } else {
      priceUsd = Math.round(parsed.value * 100) / 100;
    }
  } else if (row.parsed.currency === 'SYP') {
    exchangeRateUsed = (await ImportBatch.findById(row.batchId).select('exchangeRateUsed').lean())?.exchangeRateUsed ?? null;
  }
  if (priceUsd === null || priceUsd === undefined) {
    throw ApiError.badRequest('A price is needed to resolve this row.', undefined, 'IMPORT_ROW_PRICE_REQUIRED');
  }

  let unit;
  let unitGiven = false;
  if (body.unit !== undefined) {
    if (body.unit !== null && !UNIT_CODES.includes(body.unit)) {
      throw ApiError.badRequest('Invalid unit.', undefined, 'INVALID_UNIT');
    }
    unit = body.unit;
    unitGiven = body.unit !== null;
  } else if (row.parsed.unit) {
    unit = row.parsed.unit;
    unitGiven = true;
  }

  let bonuses;
  let bonusGiven = false;
  if (body.bonus !== undefined) {
    const parsed = normalizeBonusTiers(body.bonus);
    if (!parsed.ok) throw ApiError.badRequest('Invalid bonus.', undefined, 'INVALID_BONUS');
    bonuses = parsed.tiers;
    bonusGiven = true;
  } else if (row.parsed.bonusGiven && !row.reasons.includes('bad_bonus')) {
    bonuses = row.parsed.bonuses ?? [];
    bonusGiven = true;
  }

  return { priceUsd, exchangeRateUsed, unit, unitGiven, bonuses, bonusGiven };
}

async function adjustBatchCounts(batchId, resolvedCount, session) {
  await ImportBatch.updateOne(
    { _id: batchId },
    { $inc: { 'counts.review': -resolvedCount, 'counts.resolved': resolvedCount } },
    { session }
  );
}

// Resolves a review row onto a catalog item the warehouse picked (a suggestion,
// a live-search result, or - for a duplicate - the row whose price it keeps):
// the product is created/updated exactly as the import would have, the raw
// spelling is remembered as an alias so the next import matches it on its own,
// and the row leaves the review list. A duplicate group's other rows are
// resolved with it (their prices discarded). One transaction.
async function resolveImportRow(warehouseId, userId, batchId, rowId, body = {}) {
  const row = await findReviewRowOrThrow(warehouseId, batchId, rowId);
  const masterProductId = body.masterProductId ?? row.duplicateOf ?? row.masterProductId;
  if (!masterProductId || !mongoose.Types.ObjectId.isValid(String(masterProductId))) {
    throw ApiError.badRequest('Choose the catalog item this row is.', undefined, 'INVALID_MASTER_PRODUCT');
  }
  const values = await resolutionValues(row, body);

  let productId = null;
  await runInTransaction(async (session) => {
    const fresh = await findReviewRowOrThrow(warehouseId, batchId, rowId, session);
    const claimed = await ProductCatalog.findOneAndUpdate(
      { _id: masterProductId, isActive: true },
      { $set: { lastLinkedAt: new Date() } },
      { session, new: true }
    )
      .select(CATALOG_ITEM_SELECT)
      .lean();
    if (!claimed) {
      const exists = await ProductCatalog.exists({ _id: masterProductId }).session(session);
      if (exists) {
        throw ApiError.conflict('This medicine has been withdrawn from the central catalog.', 'CATALOG_ITEM_WITHDRAWN');
      }
      throw ApiError.badRequest('Invalid catalog item.', undefined, 'INVALID_MASTER_PRODUCT');
    }

    const existing = await Product.findOne({ warehouseId, masterProductId: claimed._id })
      .select(EXISTING_PRODUCT_SELECT)
      .session(session)
      .lean();
    const write = buildProductWrite({ existing, catalogItem: claimed, warehouseId, userId, ...values });
    if (write.blockedCode === 'CATALOG_ITEM_WITHDRAWN') {
      throw ApiError.conflict('This medicine has been withdrawn from the central catalog.', 'CATALOG_ITEM_WITHDRAWN');
    }
    if (write.blockedCode) {
      throw ApiError.conflict('This product has been disabled by the administration.', 'PRODUCT_DISABLED_BY_ADMIN');
    }
    await Product.bulkWrite([write.op], { session });
    productId = write.productId;

    // Remembered under the exact text the file used, so the next file with
    // the same name matches directly.
    await WarehouseProductAlias.updateOne(
      {
        warehouseId,
        rawNameKey: normalizeText(fresh.raw.name),
        rawManufacturerKey: normalizeText(fresh.raw.manufacturer),
      },
      { $set: { masterProductId: claimed._id } },
      { upsert: true, session }
    );

    const resolvedAt = new Date();
    const siblings = fresh.duplicateOf
      ? await ImportBatchRow.find({
          batchId,
          warehouseId,
          bucket: 'review',
          duplicateOf: fresh.duplicateOf,
          _id: { $ne: fresh._id },
        })
          .select('_id')
          .session(session)
          .lean()
      : [];
    await ImportBatchRow.updateOne(
      { _id: fresh._id },
      { $set: { bucket: 'resolved', masterProductId: claimed._id, productId, resolvedAt } },
      { session }
    );
    if (siblings.length) {
      await ImportBatchRow.updateMany(
        { _id: { $in: siblings.map((s) => s._id) } },
        { $set: { bucket: 'resolved', masterProductId: claimed._id, productId, resolvedAt } },
        { session }
      );
    }
    await adjustBatchCounts(batchId, 1 + siblings.length, session);
  });

  return { productId, row: await ImportBatchRow.findById(rowId).lean() };
}

// "طلب إضافة صنف جديد": the row names a medicine the central catalog does not
// have. A CatalogRequest carries the row's price, unit and bonus to the admin
// (catalogRequest.service.js); the product only comes into existence when the
// admin approves or merges it. The row leaves the review list, linked to the
// request.
async function requestCatalogItemFromRow(warehouseId, userId, batchId, rowId, body = {}) {
  const row = await findReviewRowOrThrow(warehouseId, batchId, rowId);
  const values = await resolutionValues(row, body);
  // The name exactly as written - the warehouse's corrected text if it sent
  // one, else the row's name cell - in whatever language. The admin enters the
  // Arabic name on approval (catalogRequest.service.js).
  const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const nameAr = text(body.nameAr) ?? text(body.name) ?? row.raw.name;
  const manufacturerAr = text(body.manufacturerAr) ?? row.raw.manufacturer;
  if (!normalizeText(nameAr) || !normalizeText(manufacturerAr)) {
    throw ApiError.badRequest('A name and a manufacturer are required.', undefined, 'INVALID_CATALOG_REQUEST');
  }
  const manufacturerKey = normalizeText(manufacturerAr);
  const manufacturer = manufacturerResolver(
    await Manufacturer.find({ $or: [{ key: manufacturerKey }, { enKey: manufacturerKey }] }).select('_id key enKey').lean()
  )(manufacturerKey);

  let request = null;
  await runInTransaction(async (session) => {
    const fresh = await findReviewRowOrThrow(warehouseId, batchId, rowId, session);
    [request] = await CatalogRequest.create(
      [
        {
          warehouseId,
          nameAr,
          manufacturerAr,
          manufacturerId: manufacturer ? manufacturer._id : null,
          unit: values.unitGiven ? values.unit : null,
          priceUsd: values.priceUsd,
          bonuses: values.bonusGiven ? values.bonuses : [],
          importBatchId: batchId,
          importRowId: fresh._id,
          requestedBy: userId,
        },
      ],
      { session }
    );
    await ImportBatchRow.updateOne(
      { _id: fresh._id },
      { $set: { bucket: 'resolved', catalogRequestId: request._id, resolvedAt: new Date() } },
      { session }
    );
    await adjustBatchCounts(batchId, 1, session);
  });

  const { emitToAdmins, EVENTS } = require('../realtime');
  if (EVENTS.CATALOG_REQUEST_PENDING) {
    emitToAdmins(EVENTS.CATALOG_REQUEST_PENDING, { requestId: String(request._id), warehouseId: String(warehouseId) });
  }
  return request;
}

module.exports = {
  manufacturerResolver,
  importWarehouseFile,
  listImportBatches,
  listImportRows,
  findOwnedBatchOrThrow,
  resolveImportRow,
  requestCatalogItemFromRow,
  suggestCatalogItems,
  buildProductWrite,
};
