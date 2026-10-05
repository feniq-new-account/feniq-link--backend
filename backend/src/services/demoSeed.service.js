// Demo data for a brand-new deployment: a few active warehouses, each with
// categories, medicines and one running offer, so the pharmacy app has
// something to browse and order from straight after install.
//
// Runs from server.js on boot, and only while the database has no warehouse
// at all - the first real (or demo) warehouse turns it off for good, so it can
// never touch live data. SEED_DEMO_DATA=false disables it outright.
//
// Warehouse logins are the phones below with DEMO_WAREHOUSE_PASSWORD.
const bcrypt = require('bcrypt');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const Offer = require('../models/offer.model');
const { normalizeText } = require('../utils/normalizeText');

const DEMO_WAREHOUSE_PASSWORD = 'Feniq@Demo2026';
const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORIES = [
  { nameAr: 'مسكنات', nameEn: 'Pain Relief', sortOrder: 1 },
  { nameAr: 'مضادات حيوية', nameEn: 'Antibiotics', sortOrder: 2 },
  { nameAr: 'فيتامينات', nameEn: 'Vitamins', sortOrder: 3 },
  { nameAr: 'أمراض مزمنة', nameEn: 'Chronic Care', sortOrder: 4 },
  { nameAr: 'جهاز هضمي', nameEn: 'Digestive', sortOrder: 5 },
  { nameAr: 'عناية بالبشرة', nameEn: 'Skin Care', sortOrder: 6 },
];

const MANUFACTURERS = {
  national: { ar: 'شركة الأدوية الوطنية', en: 'National Pharma' },
  sharq: { ar: 'شركة الشرق للأدوية', en: 'Al-Sharq Pharma' },
  alpha: { ar: 'شركة ألفا للأدوية', en: 'Alpha Pharma' },
  hayat: { ar: 'شركة الحياة للأدوية', en: 'Al-Hayat Pharma' },
  ibn: { ar: 'ابن حيان للصناعات الدوائية', en: 'Ibn Hayyan Pharma' },
};

// [category, nameAr, nameEn, manufacturer, unit, priceUsd]
const MEDICINES = [
  ['Pain Relief', 'باراسيتامول 500 ملغ', 'Paracetamol 500mg', 'national', 'box', 1.2],
  ['Pain Relief', 'إيبوبروفين 400 ملغ', 'Ibuprofen 400mg', 'sharq', 'box', 1.6],
  ['Pain Relief', 'ديكلوفيناك 50 ملغ', 'Diclofenac 50mg', 'alpha', 'box', 1.4],
  ['Pain Relief', 'ديكلوفيناك 75 ملغ حقن', 'Diclofenac 75mg', 'ibn', 'ampoule', 0.6],
  ['Antibiotics', 'أموكسيسيلين 500 ملغ', 'Amoxicillin 500mg', 'national', 'box', 2.5],
  ['Antibiotics', 'أوغمنتين 1 غ', 'Amoxicillin/Clavulanate 1g', 'hayat', 'box', 4.8],
  ['Antibiotics', 'أزيثروميسين 250 ملغ', 'Azithromycin 250mg', 'alpha', 'box', 3.2],
  ['Antibiotics', 'سيفترياكسون 1 غ', 'Ceftriaxone 1g', 'ibn', 'vial', 1.9],
  ['Vitamins', 'فيتامين د 50000 وحدة', 'Vitamin D 50000 IU', 'hayat', 'box', 2.2],
  ['Vitamins', 'فيتامين سي 1000 ملغ', 'Vitamin C 1000mg', 'sharq', 'box', 1.8],
  ['Vitamins', 'حديد وحمض الفوليك', 'Iron + Folic Acid', 'national', 'box', 1.5],
  ['Chronic Care', 'ميتفورمين 850 ملغ', 'Metformin 850mg', 'national', 'box', 1.3],
  ['Chronic Care', 'أملوديبين 5 ملغ', 'Amlodipine 5mg', 'alpha', 'box', 1.7],
  ['Chronic Care', 'أتورفاستاتين 20 ملغ', 'Atorvastatin 20mg', 'hayat', 'box', 3.4],
  ['Digestive', 'أوميبرازول 20 ملغ', 'Omeprazole 20mg', 'sharq', 'box', 1.9],
  ['Digestive', 'دومبيريدون 10 ملغ', 'Domperidone 10mg', 'ibn', 'box', 1.1],
  ['Skin Care', 'كريم مرطب', 'Moisturizing Cream', 'sharq', 'tube', 2.6],
  ['Skin Care', 'واقي شمس SPF 50', 'Sunscreen SPF 50', 'alpha', 'tube', 5.5],
];

const WAREHOUSES = [
  {
    phone: '0930000101',
    nameAr: 'مستودع النجاح', nameEn: 'Al-Najah Warehouse',
    address: 'شارع 8 آذار', city: 'Latakia',
    priceFactor: 1, offerOn: 'Paracetamol 500mg', discount: 15,
  },
  {
    phone: '0930000102',
    nameAr: 'مستودع الشفاء', nameEn: 'Al-Shifa Warehouse',
    address: 'شارع بغداد', city: 'Latakia',
    priceFactor: 0.95, offerOn: 'Amoxicillin 500mg', discount: 10,
  },
  {
    phone: '0930000103',
    nameAr: 'مستودع الأمل', nameEn: 'Al-Amal Warehouse',
    address: 'شارع الثورة', city: 'Latakia',
    priceFactor: 1.05, offerOn: 'Vitamin D 50000 IU', discount: 20,
  },
];

async function seedDemoDataIfEmpty() {
  if (await Warehouse.exists({})) return null;

  const categories = {};
  for (const c of CATEGORIES) {
    // By the unique key, so a category the catalog import already created is
    // reused rather than refused as a duplicate.
    const key = normalizeText(c.nameAr);
    categories[c.nameEn] =
      (await Category.findOne({ key })) || (await Category.create({ ...c, key, icon: null }));
  }

  const password = await bcrypt.hash(DEMO_WAREHOUSE_PASSWORD, 10);
  const now = new Date();
  let productCount = 0;

  for (const w of WAREHOUSES) {
    const user =
      (await User.findOne({ phone: w.phone })) ||
      (await User.create({ name: w.nameEn, phone: w.phone, password, role: 'warehouse', status: 'active' }));

    const warehouse = await Warehouse.create({
      userId: user._id,
      nameAr: w.nameAr,
      nameEn: w.nameEn,
      address: w.address,
      city: w.city,
      phone: w.phone,
      logo: null,
      isActive: true,
    });

    const products = await Product.create(
      MEDICINES.map(([category, nameAr, nameEn, manufacturer, unit, price]) => ({
        warehouseId: warehouse._id,
        categoryId: categories[category]._id,
        nameAr,
        nameEn,
        manufacturerAr: MANUFACTURERS[manufacturer].ar,
        manufacturerEn: MANUFACTURERS[manufacturer].en,
        unit,
        price: Math.round(price * w.priceFactor * 100) / 100,
        isAvailable: true,
      }))
    );
    productCount += products.length;

    const offerProduct = products.find((p) => p.nameEn === w.offerOn);
    await Offer.create({
      warehouseId: warehouse._id,
      productId: offerProduct._id,
      titleAr: 'عرض افتتاحي',
      titleEn: 'Launch offer',
      discountPercentage: w.discount,
      startDate: new Date(now.getTime() - DAY_MS),
      endDate: new Date(now.getTime() + 60 * DAY_MS),
      status: 'approved',
      approvedAt: now,
    });
  }

  return { warehouses: WAREHOUSES.length, products: productCount };
}

// One order per stage of the warehouse's progression, so every screen on both
// sides (pharmacy order history/tracking, warehouse queue) has something to
// show. Each is advanced through the real advanceOrderStatus, so delivered
// orders post to the ledger exactly as a real delivery would.
// [warehouse index, target status, [product nameEn, quantity]...]
const DEMO_ORDERS = [
  [0, 'pending', [['Paracetamol 500mg', 20], ['Omeprazole 20mg', 10]]],
  [1, 'confirmed', [['Amoxicillin 500mg', 15], ['Vitamin C 1000mg', 12]]],
  [2, 'preparing', [['Vitamin D 50000 IU', 10], ['Metformin 850mg', 25]]],
  [0, 'out_for_delivery', [['Ibuprofen 400mg', 30], ['Azithromycin 250mg', 8]]],
  [1, 'delivered', [['Amlodipine 5mg', 20], ['Atorvastatin 20mg', 10], ['Sunscreen SPF 50', 5]]],
];

// Demo orders for every active pharmacy that has none yet - only while the
// demo warehouses are still on the platform, so it stops for good once they
// are removed. Required lazily: the order services pull in the whole money
// stack, which seedDemoDataIfEmpty's callers don't otherwise need.
async function seedDemoOrders() {
  const Order = require('../models/order.model');
  const Pharmacy = require('../models/pharmacy.model');
  const orderService = require('./order.service');
  const warehouseOrderService = require('./warehouseOrder.service');

  const demoUsers = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' })
    .select('_id phone')
    .lean();
  const warehouses = [];
  for (const w of WAREHOUSES) {
    const user = demoUsers.find((u) => u.phone === w.phone);
    const warehouse = user && (await Warehouse.findOne({ userId: user._id }).select('_id').lean());
    if (!warehouse) return null;
    warehouses.push({ warehouseId: warehouse._id, userId: user._id });
  }

  const activeUsers = await User.find({ role: 'pharmacy', status: 'active' }).select('_id').lean();
  const pharmacies = await Pharmacy.find({ userId: { $in: activeUsers.map((u) => u._id) } })
    .select('_id userId')
    .lean();

  let created = 0;
  for (const pharmacy of pharmacies) {
    if (await Order.exists({ pharmacyId: pharmacy._id })) continue;

    for (const [index, target, lines] of DEMO_ORDERS) {
      const { warehouseId, userId: warehouseUserId } = warehouses[index];
      const products = await Product.find({
        warehouseId,
        nameEn: { $in: lines.map(([name]) => name) },
      })
        .select('_id nameEn')
        .lean();
      const items = lines
        .map(([name, quantity]) => {
          const product = products.find((p) => p.nameEn === name);
          return product && { productId: product._id.toString(), quantity };
        })
        .filter(Boolean);
      if (items.length === 0) continue;

      try {
        const order = await orderService.createOrder({
          userId: pharmacy.userId,
          pharmacyId: pharmacy._id,
          warehouseId,
          items,
          notes: 'طلب تجريبي',
        });
        const orderId = (order._id || order.id).toString();
        // Delivery is gated on a seal photo the pharmacy has to upload; the
        // warehouse can waive it per order, which is what a demo needs.
        if (target === 'delivered') {
          await warehouseOrderService.setDeliverySealRequirement(orderId, warehouseId, false);
        }
        let status = 'pending';
        while (status !== target) {
          const advanced = await warehouseOrderService.advanceOrderStatus(orderId, warehouseId, warehouseUserId);
          status = advanced.status;
        }
        created += 1;
      } catch (err) {
        // One failed demo order must not stop the rest, or the server boot.
        // eslint-disable-next-line no-console
        console.error(`Demo order (${target}) failed:`, err.message);
      }
    }
  }
  return { orders: created };
}

// A first admin for a fresh deployment, so the panel can be tried before a
// real one is made with the create-admin workflow. Only while there is no
// admin at all - the first real admin turns this off for good.
const DEMO_ADMIN = { name: 'Feniq Admin', phone: '0930000100', password: 'Feniq@Admin2026' };

// The seal-photo requirement used to default to on and was stored on every
// warehouse and order created then. Turned off for the demo warehouses and
// their undelivered orders, so delivery there is one click (owner's decision,
// 2026-10-05).
async function turnOffDemoSealPhoto() {
  const Order = require('../models/order.model');
  const users = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' }).select('_id').lean();
  const warehouses = await Warehouse.find({ userId: { $in: users.map((u) => u._id) } }).select('_id').lean();
  const ids = warehouses.map((w) => w._id);
  if (ids.length === 0) return 0;
  await Warehouse.updateMany({ _id: { $in: ids }, requireDeliverySealPhoto: true }, { $set: { requireDeliverySealPhoto: false } });
  const { modifiedCount } = await Order.updateMany(
    { warehouseId: { $in: ids }, requiresDeliverySealPhoto: true, status: { $nin: ['delivered', 'cancelled'] } },
    { $set: { requiresDeliverySealPhoto: false } }
  );
  return modifiedCount;
}

async function seedDemoAdminIfNone() {
  if (await User.exists({ role: 'admin' })) return null;
  if (await User.exists({ phone: DEMO_ADMIN.phone })) return null;
  await User.create({
    name: DEMO_ADMIN.name,
    phone: DEMO_ADMIN.phone,
    password: await bcrypt.hash(DEMO_ADMIN.password, 10),
    role: 'admin',
    status: 'active',
  });
  return { phone: DEMO_ADMIN.phone };
}

module.exports = { turnOffDemoSealPhoto, seedDemoAdminIfNone, DEMO_ADMIN, seedDemoDataIfEmpty, seedDemoOrders, DEMO_WAREHOUSE_PASSWORD, WAREHOUSES, DEMO_ORDERS };
