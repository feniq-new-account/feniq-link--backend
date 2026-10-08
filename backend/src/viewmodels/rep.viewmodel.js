// Response shapes for field reps - the warehouse's Reps page
// (warehouseRep.controller.js) and the rep's own app (rep.controller.js).

function toRep(rep) {
  return {
    id: rep._id,
    name: rep.name,
    phone: rep.phone,
    isActive: rep.isActive,
    commissionRate: rep.commissionRate ?? 0,
    warehouseShareToRep: rep.warehouseShareToRep ?? false,
    createdAt: rep.createdAt,
  };
}

function toRepRow({
  rep,
  pharmacyCount,
  visits30d,
  unverifiedVisits30d,
  lastVisitAt,
  monthOrdersCount,
  monthOrdersTotal,
  monthCommission,
}) {
  return {
    ...toRep(rep),
    pharmacyCount,
    visits30d,
    unverifiedVisits30d,
    lastVisitAt,
    monthOrdersCount,
    monthOrdersTotal,
    monthCommission: monthCommission ?? { repAmount: 0, feniqAmount: 0, pharmacyAmount: 0, savingAmount: 0 },
  };
}

function hasLocation(pharmacy) {
  return Boolean(pharmacy.location && Array.isArray(pharmacy.location.coordinates) && pharmacy.location.coordinates.length === 2);
}

function toPharmacy(pharmacy) {
  return {
    id: pharmacy._id,
    nameAr: pharmacy.nameAr,
    nameEn: pharmacy.nameEn,
    ownerName: pharmacy.ownerName ?? null,
    address: pharmacy.address ?? null,
    city: pharmacy.city ?? null,
    areaType: pharmacy.areaType ?? null,
    phone: pharmacy.phone ?? null,
    hasLocation: hasLocation(pharmacy),
  };
}

function toActivity(activity) {
  return {
    lastVisitAt: activity?.lastVisitAt ?? null,
    lastVerifiedVisitAt: activity?.lastVerifiedVisitAt ?? null,
    lastOrderAt: activity?.lastOrderAt ?? null,
    monthOrdersCount: activity?.monthOrdersCount ?? 0,
    monthOrdersTotal: activity?.monthOrdersTotal ?? 0,
  };
}

function toAssignedPharmacy({ pharmacy, activity, assignedAt }) {
  return {
    ...toPharmacy(pharmacy),
    ...(assignedAt ? { assignedAt } : {}),
    activity: toActivity(activity),
  };
}

function toVisit(visit) {
  return {
    id: visit._id,
    status: visit.status,
    distanceMeters: visit.distanceMeters ?? null,
    accuracyMeters: visit.accuracyMeters ?? null,
    scannedAt: visit.scannedAt,
  };
}

function toVisitRow({ visit, rep, pharmacy }) {
  return {
    ...toVisit(visit),
    rep: rep ? { id: rep._id, name: rep.name } : null,
    pharmacy: pharmacy ? { id: pharmacy._id, nameAr: pharmacy.nameAr, nameEn: pharmacy.nameEn } : null,
  };
}

function toRepOrder(order) {
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    finalPrice: order.finalPrice,
    createdAt: order.createdAt,
  };
}

function toMe({ rep, warehouse, stats }) {
  return {
    rep: toRep(rep),
    warehouse: warehouse
      ? { id: warehouse._id, nameAr: warehouse.nameAr, nameEn: warehouse.nameEn, phone: warehouse.phone, logo: warehouse.logo ?? null }
      : null,
    stats,
  };
}

module.exports = {
  toRep,
  toRepRow,
  toPharmacy,
  toAssignedPharmacy,
  toVisit,
  toVisitRow,
  toRepOrder,
  toMe,
};
