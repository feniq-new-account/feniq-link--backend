const { ApiError } = require('../utils/ApiError');
const { normalizeText } = require('../utils/normalizeText');
const ImportColumnMapping = require('../models/importColumnMapping.model');

// "Which column is which" answers, remembered per header (catalog overhaul
// Phase 4.1). Shared by both Excel imports: a warehouse's price list
// (warehouseImport.service.js) keeps its own, keyed by warehouseId; the
// admin's catalog import (productCatalog.service.js) keeps one shared set
// under warehouseId null.

async function loadSavedMapping(warehouseId) {
  const rows = await ImportColumnMapping.find({ warehouseId: warehouseId ?? null }).select('headerKey field').lean();
  return new Map(rows.map((row) => [row.headerKey, row.field]));
}

// { headerKey: field } from the web's mapping step -> Map, validated.
function parseExplicitMapping(input) {
  if (!input) return null;
  let object = input;
  if (typeof input === 'string') {
    try {
      object = JSON.parse(input);
    } catch {
      throw ApiError.badRequest('Invalid column mapping.', undefined, 'INVALID_COLUMN_MAPPING');
    }
  }
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw ApiError.badRequest('Invalid column mapping.', undefined, 'INVALID_COLUMN_MAPPING');
  }
  const allowed = new Set(ImportColumnMapping.schema.path('field').enumValues);
  const mapping = new Map();
  for (const [headerKey, field] of Object.entries(object)) {
    if (!field) continue;
    if (!allowed.has(field)) throw ApiError.badRequest('Invalid column mapping.', undefined, 'INVALID_COLUMN_MAPPING');
    mapping.set(normalizeText(headerKey), field);
  }
  return mapping;
}

async function saveMapping(warehouseId, mapping) {
  if (!mapping || mapping.size === 0) return;
  const scope = warehouseId ?? null;
  await ImportColumnMapping.bulkWrite(
    [...mapping].map(([headerKey, field]) => ({
      updateOne: {
        filter: { warehouseId: scope, headerKey },
        update: { $set: { field }, $setOnInsert: { warehouseId: scope, headerKey } },
        upsert: true,
      },
    }))
  );
}

module.exports = { loadSavedMapping, parseExplicitMapping, saveMapping };
