const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    titleAr: { type: String, required: true },
    titleEn: { type: String, required: true },
    bodyAr: { type: String, required: true },
    bodyEn: { type: String, required: true },
    type: {
      type: String,
      // 'discount_code': a pharmacy-specific discount code just became usable
      // (discountCode.service.js). Its own type rather than 'offer', so it is
      // never swallowed by the one-'offer'-per-24h rate limit.
      enum: ['order_update', 'offer', 'system', 'complaint', 'discount_code'],
      required: true,
    },
    // Filled in only when type = 'order_update', for deep-linking to the order.
    relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    // Filled in only when type = 'complaint' (an admin replied to a complaint),
    // for deep-linking straight to that complaint's detail screen. Same role
    // relatedOrderId plays for order updates - see notification.service.js.
    relatedComplaintId: { type: Schema.Types.ObjectId, ref: 'Complaint', default: null },
    // Filled in only when type = 'discount_code' for a WAREHOUSE's code: the
    // one warehouse the code works on, so tapping it opens that warehouse. An
    // admin code works on every warehouse and leaves this null.
    relatedWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    // Filled in only when type = 'system' (an admin-sent broadcast).
    sentByAdminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isRead: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('Notification', notificationSchema);
