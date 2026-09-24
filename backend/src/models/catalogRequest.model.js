const { Schema, model } = require('mongoose');
const { UNIT_CODES } = require('../config/units');

const bonusTierSchema = new Schema(
  {
    buy: { type: Number, required: true, min: 1 },
    free: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

// A warehouse asking the admin to add a medicine the central catalog does not
// have yet - raised from an import row that matched nothing ("طلب إضافة صنف
// جديد"). It carries everything needed to create the warehouse's product the
// moment the admin decides, so nothing has to be re-entered:
//   approved -> a new catalog item is created (the admin may correct the name,
//               manufacturer and category first), then the product, then the
//               alias;
//   merged   -> the request is linked to an existing catalog item instead;
//   rejected -> `rejectReason` is shown to the warehouse.
//
// There is no Product until approval or merge, so a pending request is
// invisible to pharmacists by construction (catalogRequest.service.js).
const catalogRequestSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    nameAr: { type: String, required: true, trim: true },
    // The raw manufacturer text the warehouse used. `manufacturerId` is set
    // when it already resolves to a Manufacturer; otherwise the admin links it
    // to an existing one or creates it on approval.
    manufacturerAr: { type: String, required: true, trim: true },
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    unit: { type: String, enum: [...UNIT_CODES, null], default: null },
    priceUsd: { type: Number, required: true, min: 0 },
    bonuses: { type: [bonusTierSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'merged', 'rejected'],
      default: 'pending',
    },
    resolvedMasterProductId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', default: null },
    // The product created on approval/merge (null until then).
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    rejectReason: { type: String, default: null },
    // Where the request came from, so the warehouse's import results page can
    // show it against the row that raised it.
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', default: null },
    importRowId: { type: Schema.Types.ObjectId, ref: 'ImportBatchRow', default: null },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The admin queue (pending, oldest first) and the warehouse's own list.
catalogRequestSchema.index({ status: 1, _id: 1 });
catalogRequestSchema.index({ warehouseId: 1, _id: -1 });
// Catalog merges repoint resolved requests to the surviving item.
catalogRequestSchema.index({ resolvedMasterProductId: 1 });

module.exports = model('CatalogRequest', catalogRequestSchema);
