const { Schema, model } = require('mongoose');
const Manufacturer = require('./manufacturer.model');
const { normalizeText } = require('../utils/normalizeText');

// Section 15 (follow-up): a warehouse's manufacturer registry, populated by
// Excel imports (see warehouseProduct.service.js's importProductsFromExcel)
// - unlike deriving the list live from current products, this is
// deliberately sticky: a manufacturer registered once stays here even after
// every one of its products is later removed, so the Discounts tab's
// dropdown (manufacturerDiscount.service.js) doesn't lose an option just
// because inventory temporarily has none of that manufacturer's items.
//
// Keyed on the central Manufacturer (M3), like ManufacturerDiscount, so the
// same company spelled two ways in two files is one registry row.
// `manufacturerAr` is the display copy, synced on rename/merge.
const warehouseManufacturerSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    manufacturerId: { type: Schema.Types.ObjectId, ref: 'Manufacturer', default: null },
    manufacturerAr: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// Same rule as manufacturerDiscount.model.js: link to an existing Manufacturer
// by normalized name, never create one.
warehouseManufacturerSchema.pre('validate', async function linkManufacturer() {
  if (this.manufacturerId || !this.manufacturerAr) return;
  const manufacturer = await Manufacturer.findOne({ key: normalizeText(this.manufacturerAr) })
    .select('_id')
    .session(this.$session())
    .lean();
  if (manufacturer) this.manufacturerId = manufacturer._id;
});

warehouseManufacturerSchema.index(
  { warehouseId: 1, manufacturerId: 1 },
  { unique: true, partialFilterExpression: { manufacturerId: { $type: 'objectId' } } }
);

module.exports = model('WarehouseManufacturer', warehouseManufacturerSchema);
