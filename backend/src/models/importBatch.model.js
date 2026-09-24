const { Schema, model } = require('mongoose');

// One warehouse Excel import. The per-row outcomes live in ImportBatchRow
// (importBatchRow.model.js) rather than an embedded array: a 5MB workbook can
// hold tens of thousands of rows, which an embedded array would push past
// MongoDB's 16MB document limit. This document is the header the results
// page opens on - the counts per tab, the rate SYP prices were converted at,
// and when/what was uploaded.
const importBatchSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    fileName: { type: String, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // The USD/SYP rate every SYP row in this file was converted at (null when
    // the file had no SYP prices).
    exchangeRateUsed: { type: Number, default: null },
    // One count per results tab. `review` goes down as the warehouse resolves
    // rows; `resolved` goes up.
    counts: {
      added: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      addedDisabled: { type: Number, default: 0 },
      blocked: { type: Number, default: 0 },
      review: { type: Number, default: 0 },
      resolved: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// The warehouse's "recent imports" list.
importBatchSchema.index({ warehouseId: 1, _id: -1 });

module.exports = model('ImportBatch', importBatchSchema);
