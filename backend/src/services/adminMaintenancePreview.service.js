'use strict';
// Read-only inventory for the known legacy demonstration warehouses.
// This is NOT a backup, a deletion manifest, or permission to reset the DB.
// Destructive maintenance requires a separately verified restore point.
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Order = require('../models/order.model');
const { readLaunch, publicStatus } = require('./launch.service');

const PILOT_PHONES = ['0930000101', '0930000102', '0930000103'];
const SCOPED_COLLECTIONS = [
  'products', 'offers', 'advertisements', 'banners',
  'orders', 'returns', 'payments', 'ledgerentries',
  'creditentries', 'pharmacycredits', 'complaints',
  'discountcodes', 'warehouseaudits', 'warehousefeaturecontrols',
];
const MAX_ORDER_IDS_FOR_DETAIL = 5000;

async function previewPilotCleanup() {
  const users = await User.find({ phone: { $in: PILOT_PHONES }, role: 'warehouse' })
    .select('_id phone status').lean();
  const ownersById = new Map(users.map(user => [String(user._id), user]));
  const warehouses = await Warehouse.find({ userId: { $in: users.map(user => user._id) } })
    .select('_id userId nameAr city isActive').sort({ nameAr: 1 }).lean();
  const db = Warehouse.db.db;
  const now = new Date();
  const [activePharmacies, totalPharmacies] = await Promise.all([
    User.countDocuments({ role: 'pharmacy', status: 'active' }),
    User.countDocuments({ role: 'pharmacy' }),
  ]);
  const liveWindow = { status: 'approved', startDate: { $lte: now }, endDate: { $gte: now } };
  const liveOffers = {
    status: 'approved', startDate: { $lte: now },
    $or: [{ isPermanent: true }, { endDate: { $gte: now } }],
  };
  const rows = await Promise.all(warehouses.map(async warehouse => {
    const counts = {};
    await Promise.all(SCOPED_COLLECTIONS.map(async name => {
      counts[name] = await db.collection(name).countDocuments({ warehouseId: warehouse._id });
    }));
    const totalOrderRows = counts.orders;
    if (totalOrderRows > MAX_ORDER_IDS_FOR_DETAIL) {
      counts.orderitems = null;
    } else {
      const orderIds = await Order.find({ warehouseId: warehouse._id }).select('_id').lean();
      counts.orderitems = orderIds.length
        ? await db.collection('orderitems').countDocuments({ orderId: { $in: orderIds.map(row => row._id) } })
        : 0;
    }
    // Match the same visibility windows used by the pharmacist offer/package/
    // banner services, rather than merely counting records whose date expired.
    const [availableProducts, visibleOffers, visiblePackages, visibleBanners] = await Promise.all([
      db.collection('products').countDocuments({ warehouseId: warehouse._id, isAvailable: { $ne: false }, isActive: { $ne: false } }),
      db.collection('offers').countDocuments({ warehouseId: warehouse._id, ...liveOffers }),
      db.collection('advertisements').countDocuments({ warehouseId: warehouse._id, ...liveWindow, isAvailable: { $ne: false } }),
      db.collection('banners').countDocuments({ warehouseId: warehouse._id, ...liveWindow }),
    ]);
    const owner = ownersById.get(String(warehouse.userId));
    const visibleToPharmacist = warehouse.isActive && owner?.status === 'active';
    return {
      id: String(warehouse._id),
      nameAr: warehouse.nameAr,
      city: warehouse.city,
      warehouseActive: warehouse.isActive,
      accountStatus: owner?.status || 'missing',
      counts,
      readiness: {
        visibleToPharmacist,
        availableProducts,
        visibleOffers,
        visiblePackages,
        visibleBanners,
        canReceiveOrders: visibleToPharmacist && availableProducts > 0,
      },
    };
  }));
  const launch = publicStatus(await readLaunch());
  return {
    readOnly: true,
    cleanupAvailable: false,
    verifiedRestorePoint: false,
    generatedAt: new Date().toISOString(),
    knownDemoAccounts: PILOT_PHONES.length,
    foundWarehouses: rows.length,
    warehouses: rows,
    ordering: launch,
    needsAccountRecovery: rows.filter(row => row.accountStatus !== 'active').length,
    pilotReadiness: {
      activePharmacies,
      totalPharmacies,
      visibleWarehouses: rows.filter(row => row.readiness.visibleToPharmacist).length,
      warehousesWithCatalog: rows.filter(row => row.readiness.visibleToPharmacist && row.readiness.availableProducts > 0).length,
      warehousesWithOffers: rows.filter(row => row.readiness.visibleToPharmacist && row.readiness.visibleOffers > 0).length,
      warehousesWithPackages: rows.filter(row => row.readiness.visibleToPharmacist && row.readiness.visiblePackages > 0).length,
      orderingEnabled: launch.orderingEnabled,
      // A live order, web deployment and backup are NOT verified by a read-only
      // database report; never present these counts as end-to-end acceptance.
      phoneToDashboardVerified: false,
      deployVerified: false,
      backupVerifiedForCleanup: false,
    },
    needsFinancialReview: rows.some(row => Object.entries(row.counts).some(([name, count]) =>
      ['orders', 'returns', 'payments', 'ledgerentries', 'creditentries', 'pharmacycredits'].includes(name) && count > 0)),
    backupWorkflowUrl: 'https://github.com/feniq-new-account/feniq-link--backend/actions/workflows/db-backup.yml',
    restoreGuideUrl: 'https://github.com/feniq-new-account/feniq-link--backend/blob/main/backend/scripts/backup/README.md',
  };
}

module.exports = { previewPilotCleanup, PILOT_PHONES };
