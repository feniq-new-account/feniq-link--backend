const { Schema, model } = require('mongoose');

// A warehouse's manual answer to "which column is which", remembered per
// header. When the import cannot recognize a required column from the synonym
// table (config/importSynonyms.js), the web asks the warehouse to map the
// file's headers; each choice is saved here and applied automatically the next
// time a file with the same header arrives, so the question is asked once.
//
// `headerKey` is the header cell's text after normalizeText(); `field` is one
// of the import fields (name, price, manufacturer, unit, currency, bonus).
// `warehouseId` null is the admin's catalog import, whose answers are shared
// by every admin (importMapping.service.js).
const importColumnMappingSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    headerKey: { type: String, required: true },
    field: {
      type: String,
      enum: ['name', 'price', 'manufacturer', 'unit', 'currency', 'bonus'],
      required: true,
    },
  },
  { timestamps: true }
);

importColumnMappingSchema.index({ warehouseId: 1, headerKey: 1 }, { unique: true });

module.exports = model('ImportColumnMapping', importColumnMappingSchema);
