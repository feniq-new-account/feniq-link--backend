const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { normalizeText } = require('../utils/normalizeText');
const CatalogRequest = require('../models/catalogRequest.model');
const ProductCatalog = require('../models/productCatalog.model');
const Product = require('../models/product.model');
const Manufacturer = require('../models/manufacturer.model');
const Category = require('../models/category.model');
const Warehouse = require('../models/warehouse.model');
const WarehouseProductAlias = require('../models/warehouseProductAlias.model');
const ImportBatchRow = require('../models/importBatchRow.model');
const { buildProductWrite } = require('./warehouseImport.service');
const { emitToAdmins, emitToWarehouse, EVENTS } = require('../realtime');

// Catalog requests (catalog overhaul Phase 5.1): a warehouse's "please add
// this medicine" raised from an import row. The admin approves it (a new
// catalog item, name/manufacturer/category editable first), merges it into an
// existing item, or rejects it with a reason the warehouse sees.
//
// Until approve/merge there is no Product at all - so a pending request is
// invisible to pharmacists by construction. Approve and merge create the
// warehouse's product from the request's own price, unit and bonus through the
// import's write (warehouseImport.service.js's buildProductWrite), and save
// the alias so the warehouse's next import matches the raw spelling on its own.

const CATALOG_ITEM_SELECT = 'nameAr nameKey nameEnKey manufacturerAr manufacturerKey manufacturerEnKey manufacturerId categoryId isActive';
const DEFAULT_LIMIT = 30;

async function listRequests({ status, warehouseId, limit = DEFAULT_LIMIT, after = null } = {}) {
  const filter = {};
  if (status !== undefined) {
    if (typeof status !== 'string' || !CatalogRequest.schema.path('status').enumValues.includes(status)) {
      throw ApiError.badRequest('Invalid status filter.', undefined, 'INVALID_STATUS_FILTER');
    }
    filter.status = status;
  }
  if (warehouseId) filter.warehouseId = warehouseId;
  // The admin's pending queue is oldest first (FIFO); every other list is
  // newest first.
  const ascending = status === 'pending' && !warehouseId;
  if (after) filter._id = ascending ? { $gt: after } : { $lt: after };
  const rows = await CatalogRequest.find(filter)
    .sort({ _id: ascending ? 1 : -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const warehouses = page.length
    ? await Warehouse.find({ _id: { $in: [...new Set(page.map((r) => String(r.warehouseId)))] } })
        .select('nameAr nameEn')
        .lean()
    : [];
  const warehouseById = new Map(warehouses.map((w) => [String(w._id), w]));
  return {
    rows: page.map((request) => ({ request, warehouse: warehouseById.get(String(request.warehouseId)) ?? null })),
    hasMore,
    nextCursor: page.length ? String(page[page.length - 1]._id) : null,
  };
}

async function findPendingRequestOrThrow(id, session = null) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Catalog request not found.', 'CATALOG_REQUEST_NOT_FOUND');
  }
  const request = await CatalogRequest.findById(id).session(session);
  if (!request) throw ApiError.notFound('Catalog request not found.', 'CATALOG_REQUEST_NOT_FOUND');
  if (request.status !== 'pending') {
    throw ApiError.conflict('This request has already been decided.', 'CATALOG_REQUEST_ALREADY_DECIDED');
  }
  return request;
}

// Creates (or updates) the warehouse's product for `catalogItem` from the
// request's terms, and remembers the raw spelling as an alias. Inside the
// caller's transaction.
async function fulfil(request, catalogItem, adminId, session) {
  const existing = await Product.findOne({ warehouseId: request.warehouseId, masterProductId: catalogItem._id })
    .select('masterProductId price isActive deactivatedBy manuallyDisabled')
    .session(session)
    .lean();
  const write = buildProductWrite({
    existing,
    catalogItem,
    warehouseId: request.warehouseId,
    userId: adminId,
    priceUsd: request.priceUsd,
    unit: request.unit,
    unitGiven: Boolean(request.unit),
    bonuses: request.bonuses.map((tier) => ({ buy: tier.buy, free: tier.free })),
    bonusGiven: true,
  });
  if (write.blockedCode) {
    throw ApiError.conflict(
      'The warehouse already has this medicine, disabled by the platform.',
      write.blockedCode
    );
  }
  await Product.bulkWrite([write.op], { session });

  await WarehouseProductAlias.updateOne(
    {
      warehouseId: request.warehouseId,
      rawNameKey: normalizeText(request.nameAr),
      rawManufacturerKey: normalizeText(request.manufacturerAr),
    },
    { $set: { masterProductId: catalogItem._id } },
    { upsert: true, session }
  );
  if (request.importRowId) {
    await ImportBatchRow.updateOne(
      { _id: request.importRowId },
      { $set: { masterProductId: catalogItem._id, productId: write.productId } },
      { session }
    );
  }
  return write.productId;
}

function announce(request) {
  const payload = { requestId: String(request._id), warehouseId: String(request.warehouseId), status: request.status };
  emitToAdmins(EVENTS.CATALOG_REQUEST_UPDATED, payload);
  emitToWarehouse(request.warehouseId, EVENTS.CATALOG_REQUEST_UPDATED, payload);
}

// Approve: a NEW catalog item. The admin may correct the name, and must settle
// the manufacturer - an existing one (`manufacturerId`), or a new one created
// now (`createManufacturer: true`, from `manufacturerAr` or the request's own
// text). A name that turns out to be an existing item is refused with that
// item's id, so the panel can offer a merge instead.
async function approveRequest(id, adminId, changes = {}) {
  let request;
  await runInTransaction(async (session) => {
    request = await findPendingRequestOrThrow(id, session);

    const nameAr = typeof changes.nameAr === 'string' && changes.nameAr.trim() ? changes.nameAr.trim() : request.nameAr;
    const nameEn = typeof changes.nameEn === 'string' && changes.nameEn.trim() ? changes.nameEn.trim() : null;

    let manufacturer = null;
    const manufacturerId = changes.manufacturerId ?? request.manufacturerId;
    if (manufacturerId) {
      if (!mongoose.Types.ObjectId.isValid(String(manufacturerId))) {
        throw ApiError.badRequest('Invalid manufacturer.', undefined, 'INVALID_MANUFACTURER');
      }
      manufacturer = await Manufacturer.findById(manufacturerId).session(session);
      if (!manufacturer) throw ApiError.badRequest('Invalid manufacturer.', undefined, 'INVALID_MANUFACTURER');
    } else {
      const manufacturerAr =
        typeof changes.manufacturerAr === 'string' && changes.manufacturerAr.trim()
          ? changes.manufacturerAr.trim()
          : request.manufacturerAr;
      const key = normalizeText(manufacturerAr);
      manufacturer = await Manufacturer.findOne({ key }).session(session);
      if (!manufacturer) {
        if (changes.createManufacturer !== true) {
          throw ApiError.badRequest(
            'This manufacturer does not exist yet - link an existing one or confirm creating it.',
            { manufacturerAr },
            'MANUFACTURER_CONFIRMATION_REQUIRED'
          );
        }
        [manufacturer] = await Manufacturer.create([{ nameAr: manufacturerAr }], { session });
      }
    }

    let categoryId = null;
    if (changes.categoryId) {
      if (!mongoose.Types.ObjectId.isValid(String(changes.categoryId)) || !(await Category.exists({ _id: changes.categoryId }).session(session))) {
        throw ApiError.badRequest('Invalid category.', undefined, 'INVALID_CATEGORY');
      }
      categoryId = changes.categoryId;
    }

    const existing = await ProductCatalog.findOne({ nameKey: normalizeText(nameAr), manufacturerId: manufacturer._id })
      .select('_id')
      .session(session)
      .lean();
    if (existing) {
      throw ApiError.conflict('This medicine already exists in the catalog - merge the request into it.', 'CATALOG_ITEM_ALREADY_EXISTS', {
        masterProductId: existing._id,
      });
    }

    const [item] = await ProductCatalog.create(
      [
        {
          nameAr,
          nameEn,
          manufacturerAr: manufacturer.nameAr,
          manufacturerEn: manufacturer.nameEn ?? null,
          manufacturerId: manufacturer._id,
          categoryId,
          priceUsd: request.priceUsd,
        },
      ],
      { session }
    );
    const catalogItem = await ProductCatalog.findById(item._id).select(CATALOG_ITEM_SELECT).session(session).lean();
    const productId = await fulfil(request, catalogItem, adminId, session);

    request.status = 'approved';
    request.resolvedMasterProductId = item._id;
    request.productId = productId;
    request.manufacturerId = manufacturer._id;
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    await request.save({ session });
  });
  announce(request);
  return request;
}

// Merge: the request names a medicine the catalog already has (under another
// spelling) - the warehouse's product is linked to that item.
async function mergeRequest(id, adminId, { masterProductId } = {}) {
  if (!masterProductId || !mongoose.Types.ObjectId.isValid(String(masterProductId))) {
    throw ApiError.badRequest('Choose the catalog item to merge into.', undefined, 'INVALID_MASTER_PRODUCT');
  }
  let request;
  await runInTransaction(async (session) => {
    request = await findPendingRequestOrThrow(id, session);
    const catalogItem = await ProductCatalog.findOneAndUpdate(
      { _id: masterProductId, isActive: true },
      { $set: { lastLinkedAt: new Date() } },
      { session, new: true }
    )
      .select(CATALOG_ITEM_SELECT)
      .lean();
    if (!catalogItem) {
      throw ApiError.badRequest('That catalog item does not exist or has been withdrawn.', undefined, 'INVALID_MASTER_PRODUCT');
    }
    const productId = await fulfil(request, catalogItem, adminId, session);
    request.status = 'merged';
    request.resolvedMasterProductId = catalogItem._id;
    request.productId = productId;
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    await request.save({ session });
  });
  announce(request);
  return request;
}

async function rejectRequest(id, adminId, { reason } = {}) {
  if (typeof reason !== 'string' || !reason.trim()) {
    throw ApiError.badRequest('A reason is required.', undefined, 'REJECTION_REASON_REQUIRED');
  }
  const request = await findPendingRequestOrThrow(id);
  request.status = 'rejected';
  request.rejectReason = reason.trim();
  request.resolvedBy = adminId;
  request.resolvedAt = new Date();
  await request.save();
  announce(request);
  return request;
}

module.exports = { listRequests, approveRequest, mergeRequest, rejectRequest };
