// The warehouse's own view of its settings. discountRate/commissionRate are
// included read-only for reference (the admin sets those, not the warehouse
// - see admin.service.js's createWarehouseAccount).
function toWarehouseSettingsResponse(warehouse) {
  return {
    settings: {
      id: warehouse._id,
      nameAr: warehouse.nameAr,
      nameEn: warehouse.nameEn,
      city: warehouse.city,
      address: warehouse.address,
      phone: warehouse.phone,
      deliveryType: warehouse.deliveryType,
      deliveryStartTime: warehouse.deliveryStartTime,
      deliveryEndTime: warehouse.deliveryEndTime,
      discountRate: warehouse.discountRate,
      commissionRate: warehouse.commissionRate,
      minOrderAmountUsd: warehouse.minOrderAmountUsd,
      maxOrderAmountUsd: warehouse.maxOrderAmountUsd,
      // Proof-of-delivery toggle (warehouse.model.js), on by default. `?? true`
      // for documents that predate the field, matching order.service.js.
      requireDeliverySealPhoto: warehouse.requireDeliverySealPhoto ?? false,
      // The warehouse's own loyalty discount (utils/loyalty.js).
      loyalty: {
        mode: warehouse.loyalty?.mode ?? 'per_order',
        revision: warehouse.loyalty?.revision ?? 0,
        enabled: warehouse.loyalty?.enabled ?? false,
        tiers: (warehouse.loyalty?.tiers ?? []).map((tier) => ({ minSyp: tier.minSyp, discountSyp: tier.discountSyp })),
      },
    },
  };
}

module.exports = { toWarehouseSettingsResponse };
