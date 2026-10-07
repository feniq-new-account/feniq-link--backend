const { Schema, model } = require('mongoose');

// Which rep looks after a pharmacy FOR ONE WAREHOUSE. The same pharmacy has a
// rep at each warehouse it buys from, so the pair (warehouseId, pharmacyId) is
// the key - never the pharmacy alone.
//
// The pharmacy belongs to the warehouse, not to the rep: only the warehouse
// assigns or moves it (rep.service.js). A move closes the current row
// (active: false, endedAt) and opens a new one, so who covered a pharmacy
// when is never lost - and orders keep the rep they were placed under
// (order.model.js's repId).
const repAssignmentSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    repId: { type: Schema.Types.ObjectId, ref: 'Rep', required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// At most one live assignment per pharmacy per warehouse.
repAssignmentSchema.index(
  { warehouseId: 1, pharmacyId: 1 },
  { unique: true, partialFilterExpression: { active: true } }
);
repAssignmentSchema.index({ repId: 1, active: 1 });

module.exports = model('RepAssignment', repAssignmentSchema);
