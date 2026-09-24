// The catalog's main queries, run through explain("executionStats") on a
// seeded database (catalog overhaul Phase 11, M6). Shared by
// test/catalog.explain.test.js (which fails on a collection scan or an
// in-memory sort) and scripts/explain-catalog-queries.js (which prints the
// plans for the PR description).
//
// Each query is built the way the service builds it - the same
// buildProductFilter, sort and page size - so the plan checked here is the
// plan production runs.
const mongoose = require('mongoose');
const Product = require('../../src/models/product.model');
const ProductCatalog = require('../../src/models/productCatalog.model');
const Manufacturer = require('../../src/models/manufacturer.model');
const { normalizeText } = require('../../src/utils/normalizeText');
const { buildProductFilter } = require('../../src/services/productCatalog.service');

const SKEWED_MANUFACTURER = 'فارما الأولى';

// Three warehouses; in each, most products belong to one manufacturer (the
// "skewed manufacturer" shape that made the old per-manufacturer path slow).
async function seedCatalog({ warehouses = 3, productsPerWarehouse = 4000, catalogSize = 6000 } = {}) {
  await Promise.all([Product.syncIndexes(), ProductCatalog.syncIndexes(), Manufacturer.syncIndexes()]);

  const manufacturerNames = [SKEWED_MANUFACTURER, ...Array.from({ length: 40 }, (_, i) => `شركة ${i}`)];
  const manufacturerDocs = manufacturerNames.map((nameAr) => ({
    _id: new mongoose.Types.ObjectId(),
    nameAr,
    key: normalizeText(nameAr),
    isActive: true,
  }));
  await Manufacturer.collection.insertMany(manufacturerDocs);

  const catalogDocs = Array.from({ length: catalogSize }, (_, i) => {
    // ~70% of the catalog is the skewed manufacturer.
    const manufacturer = i % 10 < 7 ? manufacturerDocs[0] : manufacturerDocs[1 + (i % 40)];
    const nameAr = `بنادول ${i}`;
    const nameEn = `Panadol ${i}`;
    const nameKey = normalizeText(nameAr);
    return {
      _id: new mongoose.Types.ObjectId(),
      nameAr,
      nameEn,
      manufacturerAr: manufacturer.nameAr,
      manufacturerId: manufacturer._id,
      nameKey,
      nameEnKey: normalizeText(nameEn),
      manufacturerKey: manufacturer.key,
      identityKey: `${nameKey}|${manufacturer.key}`,
      isActive: true,
    };
  });
  await ProductCatalog.collection.insertMany(catalogDocs);

  const warehouseIds = Array.from({ length: warehouses }, () => new mongoose.Types.ObjectId());
  const productDocs = [];
  for (const warehouseId of warehouseIds) {
    for (let i = 0; i < productsPerWarehouse; i += 1) {
      const item = catalogDocs[i % catalogSize];
      productDocs.push({
        _id: new mongoose.Types.ObjectId(),
        warehouseId,
        masterProductId: item._id,
        manufacturerId: item.manufacturerId,
        nameKey: item.nameKey,
        nameEnKey: item.nameEnKey,
        manufacturerKey: item.manufacturerKey,
        manufacturerEnKey: null,
        price: 5,
        isActive: i % 50 !== 0,
        isAvailable: true,
        manuallyDisabled: false,
        bonuses: [],
      });
    }
  }
  await Product.collection.insertMany(productDocs);

  return { warehouseId: warehouseIds[0], catalogItemId: catalogDocs[1]._id, total: productDocs.length };
}

// Walks a plan tree: every stage name and every index used.
function summarizePlan(plan) {
  const stages = [];
  const indexes = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.stage) stages.push(node.stage);
    if (node.indexName) indexes.add(node.indexName);
    for (const child of [node.inputStage, ...(node.inputStages || [])]) walk(child);
    if (node.queryPlan) walk(node.queryPlan);
  })(plan);
  return { stages, indexes: [...indexes] };
}

// The planner section of an explain, wherever the server version put it
// (find vs aggregate, pipeline pushed down into the query layer or not).
function plannerOf(explain) {
  if (explain.queryPlanner) return { planner: explain.queryPlanner, stats: explain.executionStats };
  const cursorStage = (explain.stages || []).find((stage) => stage.$cursor);
  if (cursorStage) {
    return { planner: cursorStage.$cursor.queryPlanner, stats: cursorStage.$cursor.executionStats };
  }
  return { planner: null, stats: null };
}

function describe(name, explain) {
  const { planner, stats } = plannerOf(explain);
  const winning = planner?.winningPlan?.queryPlan ?? planner?.winningPlan;
  const { stages, indexes } = summarizePlan(winning);
  return {
    name,
    stages,
    indexes,
    keysExamined: stats?.totalKeysExamined ?? null,
    docsExamined: stats?.totalDocsExamined ?? null,
    returned: stats?.nReturned ?? null,
  };
}

async function explainCatalogQueries({ warehouseId, catalogItemId }) {
  const results = [];
  const page = (filter, direction, limit) =>
    Product.find(filter).sort({ _id: direction }).limit(limit + 1).explain('executionStats');

  // Pharmacist catalog (product.service.js's listWarehouseProducts): _id asc, 20.
  results.push(describe('pharmacist products, no manufacturer',
    await page(buildProductFilter({ warehouseId }), 1, 20)));
  results.push(describe('pharmacist products, skewed manufacturer',
    await page(buildProductFilter({ warehouseId, manufacturer: SKEWED_MANUFACTURER }), 1, 20)));
  // Warehouse-wide search (warehouseProduct.service.js): _id desc, 20.
  results.push(describe('warehouse-wide search',
    await page(buildProductFilter({ warehouseId, search: 'بنادول 12' }), -1, 20)));
  // Admin search across every warehouse (adminProduct.service.js): _id asc, 30.
  results.push(describe('admin search (all warehouses)',
    await page(buildProductFilter({ activeOnly: false, search: 'panadol 12' }), 1, 30)));

  // A rename's confirmation count (productCatalog.service.js's updateCatalogItem).
  // countDocuments runs as this aggregation.
  results.push(describe('rename countDocuments',
    await Product.aggregate([
      { $match: { masterProductId: catalogItemId, isActive: true } },
      { $group: { _id: 1, n: { $sum: 1 } } },
    ]).explain('executionStats')));

  // A recall (recallLinkedProducts): find the linked products, then updateMany by _id.
  results.push(describe('recall: linked products',
    await Product.find({ masterProductId: catalogItemId, isActive: true }).select('_id warehouseId').explain('executionStats')));
  const linked = await Product.find({ masterProductId: catalogItemId, isActive: true }).select('_id').lean();
  results.push(describe('recall updateMany',
    await mongoose.connection.db.command({
      explain: {
        update: Product.collection.collectionName,
        updates: [{
          q: { _id: { $in: linked.map((p) => p._id) } },
          u: { $set: { isActive: false, deactivatedBy: 'catalog_recall' } },
          multi: true,
        }],
      },
      verbosity: 'executionStats',
    })));

  // The warehouse's manufacturers list (warehouseManufacturer.service.js).
  results.push(describe('warehouse manufacturers list',
    await Product.aggregate([
      { $match: { warehouseId, isActive: true, manufacturerKey: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { manufacturerId: '$manufacturerId', manufacturerKey: '$manufacturerKey' },
          productCount: { $sum: 1 },
        },
      },
    ]).explain('executionStats')));

  return results;
}

function formatPlansTable(results, total) {
  const lines = [
    `Seeded: ${total} products (3 warehouses, ~70% of each warehouse under one manufacturer).`,
    '',
    '| query | plan | index | keys examined | docs examined | returned |',
    '|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.stages.join(' ← ')} | ${r.indexes.join(', ') || '-'} | ${r.keysExamined ?? '-'} | ${r.docsExamined ?? '-'} | ${r.returned ?? '-'} |`);
  }
  return lines.join('\n');
}

module.exports = { seedCatalog, explainCatalogQueries, formatPlansTable, SKEWED_MANUFACTURER };
