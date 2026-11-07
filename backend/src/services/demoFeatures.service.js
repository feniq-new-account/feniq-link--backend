// Demo data for every feature beyond the catalog, so each screen of the
// pharmacy app and of the warehouse / admin panels has something to try:
// a longer order history (delivered and cancelled), ratings both ways,
// returns (pending and approved), complaints, a settlement payment, banners,
// advertised packages and discount codes.
//
// Runs on boot after the other demo seeds, only while the demo warehouses
// exist. Each part checks for its own data first, so it is added once and a
// warehouse's or pharmacy's real activity is never duplicated. Each part is
// isolated: one failing is logged and the rest still run.
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Pharmacy = require('../models/pharmacy.model');
const Product = require('../models/product.model');
const ProductCatalog = require('../models/productCatalog.model');
const Order = require('../models/order.model');
const OrderItem = require('../models/orderItem.model');
const Review = require('../models/review.model');
const Return = require('../models/return.model');
const Complaint = require('../models/complaint.model');
const Payment = require('../models/payment.model');
const Banner = require('../models/banner.model');
const Advertisement = require('../models/advertisement.model');
const DiscountCode = require('../models/discountCode.model');
const { WAREHOUSES, DEMO_ADMIN } = require('./demoSeed.service');

const DAY_MS = 24 * 60 * 60 * 1000;

async function step(label, fn, report) {
  try {
    report[label] = await fn();
  } catch (err) {
    report[label] = `failed: ${err.message}`;
    // eslint-disable-next-line no-console
    console.error(`Demo ${label} failed:`, err.message);
  }
}

async function demoContext() {
  const users = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' })
    .select('_id phone')
    .lean();
  const warehouses = [];
  for (const w of WAREHOUSES) {
    const user = users.find((u) => u.phone === w.phone);
    const warehouse = user && (await Warehouse.findOne({ userId: user._id }).select('_id').lean());
    if (warehouse) warehouses.push({ warehouseId: warehouse._id, userId: user._id });
  }
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean()
    || (await User.findOne({ phone: DEMO_ADMIN.phone }).select('_id').lean());
  const activeUsers = await User.find({ role: 'pharmacy', status: 'active' }).select('_id').lean();
  const pharmacies = await Pharmacy.find({ userId: { $in: activeUsers.map((u) => u._id) } })
    .select('_id userId')
    .lean();
  return { warehouses, admin, pharmacies };
}

// A few more orders per pharmacy and warehouse, delivered, plus one the
// pharmacy cancelled - a history to browse, rate, return from and pay for.
async function addOrderHistory({ warehouses, pharmacies }) {
  const orderService = require('./order.service');
  const warehouseOrderService = require('./warehouseOrder.service');
  let created = 0;
  for (const pharmacy of pharmacies) {
    if ((await Order.countDocuments({ pharmacyId: pharmacy._id })) >= 8) continue;
    for (const [w, { warehouseId, userId }] of warehouses.entries()) {
      const products = await Product.find({ warehouseId, isAvailable: true, masterProductId: { $ne: null } })
        .select('_id')
        .sort({ _id: 1 })
        .skip(5 + w * 7)
        .limit(6)
        .lean();
      if (products.length < 4) continue;
      for (let n = 0; n < 2; n += 1) {
        const items = products.slice(n * 3, n * 3 + 3).map((p, i) => ({ productId: p._id.toString(), quantity: 5 + i * 5 }));
        const order = await orderService.createOrder({
          userId: pharmacy.userId,
          pharmacyId: pharmacy._id,
          warehouseId,
          items,
          notes: 'طلب تجريبي',
        });
        const orderId = (order._id || order.id).toString();
        await warehouseOrderService.setDeliverySealRequirement(orderId, warehouseId, false);
        // Accept, send on its way, then deliver.
        for (let s = 0; s < 3; s += 1) await warehouseOrderService.advanceOrderStatus(orderId, warehouseId, userId);
        created += 1;
      }
    }
    // One the pharmacy cancelled.
    const { warehouseId } = warehouses[0];
    const product = await Product.findOne({ warehouseId, isAvailable: true }).select('_id').lean();
    if (product) {
      const order = await orderService.createOrder({
        userId: pharmacy.userId,
        pharmacyId: pharmacy._id,
        warehouseId,
        items: [{ productId: product._id.toString(), quantity: 3 }],
        notes: 'طلب تجريبي ملغى',
      });
      await orderService.cancelOrder((order._id || order.id).toString(), pharmacy._id, pharmacy.userId);
      created += 1;
    }
  }
  return created;
}

const PHARMACY_COMMENTS = ['توصيل سريع وتعامل ممتاز', 'الطلب وصل كامل وبوقته', 'أسعار مناسبة', 'تأخر التوصيل قليلاً'];
const WAREHOUSE_COMMENTS = ['صيدلية ملتزمة بالدفع', 'تعامل محترم', 'استلام سريع'];

// The pharmacy rates the warehouse on most delivered orders, and the
// warehouse rates the pharmacy on some.
async function addReviews({ warehouses, pharmacies }) {
  if (!(await require('./runtimeFeatures.service').readRuntimeFeatures()).mutualRatings) return 0;
  const reviewService = require('./review.service');
  const warehouseReviewService = require('./warehouseReview.service');
  let created = 0;
  for (const pharmacy of pharmacies) {
    const delivered = await Order.find({ pharmacyId: pharmacy._id, status: 'delivered' }).select('_id warehouseId').sort({ _id: 1 }).lean();
    for (const [i, order] of delivered.entries()) {
      const orderId = order._id.toString();
      if (i % 4 !== 3 && !(await Review.exists({ orderId: order._id, reviewerType: 'pharmacy' }))) {
        await reviewService.createWarehouseReview(pharmacy._id, pharmacy.userId, {
          orderId,
          rating: [5, 4, 5, 3][i % 4],
          comment: PHARMACY_COMMENTS[i % PHARMACY_COMMENTS.length],
        });
        created += 1;
      }
      const warehouse = warehouses.find((w) => String(w.warehouseId) === String(order.warehouseId));
      if (warehouse && i % 2 === 0 && !(await Review.exists({ orderId: order._id, reviewerType: 'warehouse' }))) {
        await warehouseReviewService.createPharmacyReview(warehouse.warehouseId, warehouse.userId, {
          orderId,
          rating: [5, 4][i % 2],
          comment: WAREHOUSE_COMMENTS[i % WAREHOUSE_COMMENTS.length],
        });
        created += 1;
      }
    }
  }
  return created;
}

// Two returns for each pharmacy at each demo warehouse: one waiting for the
// warehouse, one it approved - so every demo warehouse has returns to try.
async function addReturns({ warehouses, pharmacies }) {
  const returnService = require('./return.service');
  const warehouseReturnService = require('./warehouseReturn.service');
  let created = 0;
  for (const pharmacy of pharmacies) {
    for (const warehouse of warehouses) {
      if (await Return.exists({ pharmacyId: pharmacy._id, warehouseId: warehouse.warehouseId })) continue;
      const delivered = await Order.find({ pharmacyId: pharmacy._id, warehouseId: warehouse.warehouseId, status: 'delivered' })
        .select('_id')
        .sort({ _id: -1 })
        .limit(2)
        .lean();
      for (const [i, order] of delivered.entries()) {
        const item = await OrderItem.findOne({ orderId: order._id }).select('_id').lean();
        if (!item) continue;
        const created_ = await returnService.createReturn({
          pharmacyId: pharmacy._id,
          orderId: order._id.toString(),
          items: [{ orderItemId: item._id.toString(), quantity: 1, reasonType: i === 0 ? 'damaged' : 'wrong_item' }],
          notes: i === 0 ? 'علبة مكسورة عند الاستلام' : 'وصل صنف غير المطلوب',
          images: [],
        });
        created += 1;
        if (i === 1) {
          const returnRequest = created_.returnRequest || created_;
          const returnId = (returnRequest._id || returnRequest.id).toString();
          await warehouseReturnService.approveReturn(returnId, warehouse.warehouseId, warehouse.userId);
        }
      }
    }
  }
  return created;
}

// A complaint from each pharmacy to each demo warehouse, about one of its
// orders there.
async function addComplaints({ warehouses, pharmacies }) {
  const complaintService = require('./complaint.service');
  let created = 0;
  for (const pharmacy of pharmacies) {
    for (const warehouse of warehouses) {
      if (await Complaint.exists({ pharmacyId: pharmacy._id, warehouseId: warehouse.warehouseId })) continue;
      const order = await Order.findOne({ pharmacyId: pharmacy._id, warehouseId: warehouse.warehouseId, status: 'delivered' })
        .select('_id warehouseId')
        .lean();
      if (!order) continue;
      await complaintService.createComplaint({
        pharmacyId: pharmacy._id,
        pharmacyUserId: pharmacy.userId,
        warehouseId: order.warehouseId,
        relatedOrderId: order._id.toString(),
        subject: 'تأخر في التوصيل',
        description: 'الطلب وصل متأخراً يوماً كاملاً عن الموعد المتفق عليه.',
      });
      created += 1;
    }
  }
  return created;
}

// A cash payment from each pharmacy towards what it owes each warehouse.
async function addPayments({ warehouses, pharmacies }) {
  const paymentService = require('./payment.service');
  let created = 0;
  for (const pharmacy of pharmacies) {
    for (const { warehouseId, userId } of warehouses) {
      if (await Payment.exists({ pharmacyId: pharmacy._id, warehouseId })) continue;
      const owed = await Order.find({ pharmacyId: pharmacy._id, warehouseId, status: 'delivered' }).select('finalPrice').lean();
      const total = owed.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
      if (total < 2) continue;
      await paymentService.createPayment(warehouseId, userId, {
        pharmacyId: pharmacy._id.toString(),
        amount: Math.floor(total / 2),
        currency: 'SYP',
        method: 'cash',
        note: 'دفعة تجريبية',
        idempotencyKey: `demo-payment-${pharmacy._id}-${warehouseId}`,
      });
      created += 1;
    }
  }
  return created;
}

// Products of a warehouse whose catalog item has a picture, with that picture.
async function pictured(warehouseId, skip) {
  const items = await ProductCatalog.find({ imageUrl: { $ne: null } }).select('_id imageUrl').lean();
  const imageById = new Map(items.map((i) => [String(i._id), i.imageUrl]));
  const products = await Product.find({ warehouseId, masterProductId: { $in: items.map((i) => i._id) } })
    .select('_id masterProductId')
    .sort({ _id: 1 })
    .skip(skip)
    .limit(12)
    .lean();
  return products.map((p) => ({ productId: p._id, imageUrl: imageById.get(String(p.masterProductId)) }));
}

// A live banner per warehouse on the home screen.
async function addBanners({ warehouses, admin }) {
  const warehouseBannerService = require('./warehouseBanner.service');
  const adminBannerService = require('./adminBanner.service');
  let created = 0;
  for (const [w, { warehouseId, userId }] of warehouses.entries()) {
    if (await Banner.exists({ warehouseId })) continue;
    const [first] = await pictured(warehouseId, w * 3);
    if (!first) continue;
    const now = Date.now();
    const banner = await warehouseBannerService.createBanner(warehouseId, userId, {
      productId: first.productId.toString(),
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 45 * DAY_MS).toISOString(),
      title: ['عروض الشتاء', 'خصومات الأسبوع', 'وصل حديثاً'][w % 3],
      imageUrl: first.imageUrl,
    });
    if (admin) await adminBannerService.approveBanner((banner._id || banner.id).toString(), admin._id);
    created += 1;
  }
  return created;
}

// An advertised package per warehouse: a few medicines at one price.
async function addPackages({ warehouses, admin }) {
  const warehouseAdvertisementService = require('./warehouseAdvertisement.service');
  const adminAdvertisementService = require('./adminAdvertisement.service');
  let created = 0;
  for (const [w, { warehouseId }] of warehouses.entries()) {
    if (await Advertisement.exists({ warehouseId })) continue;
    const picks = await pictured(warehouseId, 20 + w * 4);
    if (picks.length < 3) continue;
    const chosen = picks.slice(0, 3);
    const products = await Product.find({ _id: { $in: chosen.map((c) => c.productId) } }).select('price').lean();
    const listPrice = products.reduce((sum, p) => sum + p.price * 5, 0);
    const now = Date.now();
    const ad = await warehouseAdvertisementService.createAdvertisement(warehouseId, {
      titleAr: ['سلة الشتاء', 'سلة الأمراض المزمنة', 'سلة الصيدلية الجديدة'][w % 3],
      titleEn: ['Winter package', 'Chronic care package', 'New pharmacy package'][w % 3],
      items: chosen.map((c) => ({ productId: c.productId.toString(), quantity: 5 })),
      totalPriceUsd: Math.round(listPrice * 0.85 * 100) / 100,
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 30 * DAY_MS).toISOString(),
      imageUrl: chosen[0].imageUrl,
    });
    const advertisement = ad.advertisement || ad;
    if (admin) await adminAdvertisementService.approveAdvertisement(advertisement._id.toString(), admin._id);
    created += 1;
  }
  return created;
}

// A discount code per warehouse.
async function addDiscountCodes({ warehouses, admin }) {
  const warehouseDiscountCodeService = require('./warehouseDiscountCode.service');
  const adminDiscountCodeService = require('./adminDiscountCode.service');
  let created = 0;
  for (const [w, { warehouseId, userId }] of warehouses.entries()) {
    if (await DiscountCode.exists({ warehouseId })) continue;
    const now = Date.now();
    const code = await warehouseDiscountCodeService.createCode(warehouseId, userId, {
      type: 'percentage',
      value: [5, 7, 10][w % 3],
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 60 * DAY_MS).toISOString(),
      maxUses: 100,
      maxUsesPerPharmacy: 3,
    });
    if (admin) await adminDiscountCodeService.approveCode((code._id || code.id).toString(), admin._id);
    created += 1;
  }
  return created;
}

// A fresh order waiting at each demo warehouse that has none, so the
// one-click stages in the panel can always be tried again. Re-checked on every
// start; a warehouse that advanced all its orders gets a new one.
async function addWaitingOrders({ warehouses, pharmacies }) {
  const orderService = require('./order.service');
  const pharmacy = pharmacies[0];
  if (!pharmacy) return 0;
  let created = 0;
  for (const [w, { warehouseId }] of warehouses.entries()) {
    if (await Order.exists({ warehouseId, status: 'pending' })) continue;
    const products = await Product.find({ warehouseId, isAvailable: true, masterProductId: { $ne: null } })
      .select('_id')
      .sort({ _id: 1 })
      .skip(2 + w * 3)
      .limit(3)
      .lean();
    if (products.length === 0) continue;
    await orderService.createOrder({
      userId: pharmacy.userId,
      pharmacyId: pharmacy._id,
      warehouseId,
      items: products.map((p, i) => ({ productId: p._id.toString(), quantity: 10 + i * 5 })),
      notes: 'طلب تجريبي جديد',
    });
    created += 1;
  }
  return created;
}

async function seedDemoFeatures() {
  const context = await demoContext();
  if (context.warehouses.length === 0) return null;
  const report = {};
  await step('orders', () => addOrderHistory(context), report);
  await step('reviews', () => addReviews(context), report);
  await step('returns', () => addReturns(context), report);
  await step('complaints', () => addComplaints(context), report);
  await step('payments', () => addPayments(context), report);
  await step('banners', () => addBanners(context), report);
  await step('packages', () => addPackages(context), report);
  await step('discountCodes', () => addDiscountCodes(context), report);
  await step('waitingOrders', () => addWaitingOrders(context), report);
  return report;
}

module.exports = { seedDemoFeatures };
