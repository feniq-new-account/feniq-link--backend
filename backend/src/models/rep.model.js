const { Schema, model } = require('mongoose');

// A warehouse's field sales rep ("مندوب"). The login is a User with role
// 'rep'; this is the profile that ties it to the one warehouse that employs
// them. Created and deactivated only by that warehouse (rep.service.js).
//
// A rep sees nothing of the warehouse beyond the pharmacies assigned to them
// (repAssignment.model.js), those pharmacies' orders to this warehouse, and
// their own visits (repVisit.model.js).
const repSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    name: { type: String, required: true, trim: true },
    // Mirrors users.phone (the +963 form the app signs in with) for listing.
    phone: { type: String, required: true },
    // false = the warehouse switched this rep off: their login is blocked at
    // the same time (rep.service.js), and their pharmacies stay assigned until
    // the warehouse moves them.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

repSchema.index({ userId: 1 }, { unique: true });
repSchema.index({ warehouseId: 1, createdAt: -1 });

module.exports = model('Rep', repSchema);
