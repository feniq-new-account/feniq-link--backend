const { Schema, model } = require('mongoose');

// "The system remembers the link": once a warehouse resolves an import row
// whose name/manufacturer did not match the catalog on their own (picking a
// suggestion, or a catalog request being approved/merged), the raw spelling it
// used is remembered here against the catalog item it meant. The next import
// matches that spelling straight away (warehouseImport.service.js, matching
// step 1) instead of sending the same row back to review every time.
//
// Keys are normalized (utils/normalizeText), so the alias also catches the
// next file's harmless spelling variations of the same raw text.
const warehouseProductAliasSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    rawNameKey: { type: String, required: true },
    rawManufacturerKey: { type: String, required: true },
    masterProductId: { type: Schema.Types.ObjectId, ref: 'ProductCatalog', required: true },
  },
  { timestamps: true }
);

warehouseProductAliasSchema.index(
  { warehouseId: 1, rawNameKey: 1, rawManufacturerKey: 1 },
  { unique: true }
);
// Catalog merges repoint every alias of the merged-away items.
warehouseProductAliasSchema.index({ masterProductId: 1 });

module.exports = model('WarehouseProductAlias', warehouseProductAliasSchema);
