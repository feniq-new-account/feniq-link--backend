#!/usr/bin/env node
// يبذر قاعدة بيانات محلية فاضية بـ«مستودع تجريبي» لتصوير الملف العام:
// مستودع واحد بأصناف وصور وعروض وبونص وباقة وكود حسم، ست صيدليات وهمية، مندوبان
// بصيدلياتهم وزياراتهم، وطلبيات بكل الحالات.
//
// يستعمل نفس خدمات السيرفر الحقيقية (طلبات، مندوبين، زيارات) ونفس بيانات
// demoSeed.service.js، لكن بمستودع واحد باسم «مستودع تجريبي» وبلا حسم المنصة
// ولا عمولتها (سياسة الربح: ما في 4% ولا 1%؛ انظر HANDOFF.md).
//
//   MONGODB_URI=mongodb://127.0.0.1:27018/showcase JWT_SECRET=<32+ حرف> \
//   MEDIA_DIR=/tmp/media MEDIA_PUBLIC_URL=http://127.0.0.1:4000/media \
//   node pitch/warehouses/tools/seed-showcase.js
//
// لا تشغّله على قاعدة فيها بيانات حقيقية: يرفض إذا كان فيها أي مستودع.
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '../../../backend');
const mongoose = require(path.join(BACKEND, 'node_modules/mongoose'));
const bcrypt = require(path.join(BACKEND, 'node_modules/bcrypt'));
const { connectDB } = require(path.join(BACKEND, 'src/config/db'));
const demo = require(path.join(BACKEND, 'src/services/demoSeed.service'));
const { seedDemoCatalogImages } = require(path.join(BACKEND, 'src/services/demoCatalogImages.service'));
const { seedDemoFeatures } = require(path.join(BACKEND, 'src/services/demoFeatures.service'));
const User = require(path.join(BACKEND, 'src/models/user.model'));
const Warehouse = require(path.join(BACKEND, 'src/models/warehouse.model'));
const Pharmacy = require(path.join(BACKEND, 'src/models/pharmacy.model'));
const Product = require(path.join(BACKEND, 'src/models/product.model'));
const repService = require(path.join(BACKEND, 'src/services/rep.service'));
const repPortal = require(path.join(BACKEND, 'src/services/repPortal.service'));
const visitCodes = require(path.join(BACKEND, 'src/services/pharmacyVisitCode.service'));
const ProductCatalog = require(path.join(BACKEND, 'src/models/productCatalog.model'));
const Offer = require(path.join(BACKEND, 'src/models/offer.model'));
const Banner = require(path.join(BACKEND, 'src/models/banner.model'));
const Advertisement = require(path.join(BACKEND, 'src/models/advertisement.model'));
const Order = require(path.join(BACKEND, 'src/models/order.model'));
const warehouseBannerService = require(path.join(BACKEND, 'src/services/warehouseBanner.service'));
const adminBannerService = require(path.join(BACKEND, 'src/services/adminBanner.service'));
const warehouseAdService = require(path.join(BACKEND, 'src/services/warehouseAdvertisement.service'));
const adminAdService = require(path.join(BACKEND, 'src/services/adminAdvertisement.service'));
const paymentService = require(path.join(BACKEND, 'src/services/payment.service'));
const exchangeRate = require(path.join(BACKEND, 'src/services/exchangeRate.service'));

const PASSWORD = demo.DEMO_WAREHOUSE_PASSWORD; // Feniq@Demo2026 لكل الحسابات التجريبية
const DAY_MS = 24 * 60 * 60 * 1000;
// سعر صرف توضيحي (ل.س للدولار): السيرفر لا يسعّر طلبية بلا سعر، وهنا ما في إنترنت للسعر الحي.
const DEMO_USD_TO_SYP = 120;

const WAREHOUSE = {
  phone: '0930000200',
  nameAr: 'مستودع تجريبي',
  nameEn: 'Demo Warehouse',
  address: 'شارع تجريبي',
  city: 'Latakia',
  priceFactor: 1,
  offerOn: 'Paracetamol 500mg',
  discount: 15,
};

// أسماء مبتكرة؛ الإحداثيات حول مركز اللاذقية (GeoJSON: [طول، عرض]).
const PHARMACIES = [
  ['صيدلية الياسمين', 'Al-Yasmin Pharmacy', 'د. سلمى', '+963931000001', [35.7872, 35.5236]],
  ['صيدلية الزيتون', 'Al-Zaytoun Pharmacy', 'د. هادي', '+963931000002', [35.7921, 35.5298]],
  ['صيدلية الفجر', 'Al-Fajr Pharmacy', 'د. ريما', '+963931000003', [35.7790, 35.5190]],
  ['صيدلية الندى', 'Al-Nada Pharmacy', 'د. كنان', '+963931000004', [35.7985, 35.5351]],
  ['صيدلية الصفاء', 'Al-Safa Pharmacy', 'د. لينا', '+963931000005', [35.7714, 35.5120]],
  ['صيدلية الغدير', 'Al-Ghadeer Pharmacy', 'د. مازن', '+963931000006', [35.8040, 35.5410]],
];

// أصناف لا نعرضها بمادة تسويقية: مخدّرة أو نفسية أو أدوية صرع. تُحذف من المستودع التجريبي قبل أي طلبية.
const HIDDEN_INGREDIENTS = /TRAMADOL|BROMAZEPAM|DIAZEPAM|PREGABALIN|VALPROIC/i;

// العروض والباقة والبانر: أصناف عادية (اسم المادة الفعالة → نسبة الحسم).
const OFFER_INGREDIENTS = [
  ['ASCORBIC ACID', 15], ['PARACETAMOL', 10], ['OMEPRAZOLE', 12], ['METFORMIN', 8],
  ['LORATADINE', 20], ['FOLIC ACID', 10], ['AMBROXOL', 15], ['LANSOPRAZOLE', 12],
];
const PACKAGE_INGREDIENTS = ['METFORMIN', 'ATORVASTATIN', 'ENALAPRIL'];

const REPS = [
  { name: 'أحمد', phone: '0940000201', pharmacies: [0, 1, 2], visits: [[0, 1], [1, 2], [2, 4], [0, 6], [1, 9]] },
  { name: 'ليلى', phone: '0940000202', pharmacies: [3, 4, 5], visits: [[3, 0], [4, 1], [5, 3], [3, 5]] },
];

async function hideSensitiveProducts() {
  const hidden = await ProductCatalog.find({ activeIngredient: HIDDEN_INGREDIENTS }).select('_id').lean();
  const { deletedCount } = await Product.deleteMany({ masterProductId: { $in: hidden.map((c) => c._id) } });
  return deletedCount;
}

// نفس العروض والباقة والبانر اللي يبذرها السيرفر، لكن على أصناف عادية نختارها.
async function curatePromotions(warehouseId, warehouseUserId) {
  await Offer.deleteMany({ warehouseId });
  await Banner.deleteMany({ warehouseId });
  await Advertisement.deleteMany({ warehouseId });
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  const now = Date.now();

  async function productFor(ingredient, skip = 0) {
    const items = await ProductCatalog.find({ activeIngredient: new RegExp(`^${ingredient}$`, 'i'), imageUrl: { $ne: null } })
      .select('_id imageUrl')
      .lean();
    const product = await Product.findOne({ warehouseId, masterProductId: { $in: items.map((i) => i._id) } })
      .sort({ _id: 1 })
      .skip(skip)
      .lean();
    const item = product && items.find((i) => String(i._id) === String(product.masterProductId));
    return product ? { product, imageUrl: item.imageUrl } : null;
  }

  for (const [ingredient, discount] of OFFER_INGREDIENTS) {
    const found = await productFor(ingredient);
    if (!found) continue;
    await Offer.create({
      warehouseId,
      productId: found.product._id,
      titleAr: 'عرض الأسبوع',
      titleEn: 'Weekly offer',
      discountPercentage: discount,
      startDate: new Date(now - DAY_MS),
      endDate: new Date(now + 30 * DAY_MS),
      status: 'approved',
      approvedAt: new Date(),
    });
  }

  const banner = await productFor('PARACETAMOL');
  if (banner) {
    const created = await warehouseBannerService.createBanner(warehouseId, warehouseUserId, {
      productId: banner.product._id.toString(),
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 45 * DAY_MS).toISOString(),
      title: 'عروض الأسبوع',
      imageUrl: banner.imageUrl,
    });
    if (admin) await adminBannerService.approveBanner((created._id || created.id).toString(), admin._id);
  }

  const picks = (await Promise.all(PACKAGE_INGREDIENTS.map((i) => productFor(i)))).filter(Boolean);
  if (picks.length === PACKAGE_INGREDIENTS.length) {
    const listPrice = picks.reduce((sum, { product }) => sum + product.price * 5, 0);
    const ad = await warehouseAdService.createAdvertisement(warehouseId, {
      titleAr: 'باقة الأمراض المزمنة',
      titleEn: 'Chronic care package',
      items: picks.map(({ product }) => ({ productId: product._id.toString(), quantity: 5 })),
      totalPriceUsd: Math.round(listPrice * 0.85 * 100) / 100,
      startDate: new Date(now - DAY_MS).toISOString(),
      endDate: new Date(now + 30 * DAY_MS).toISOString(),
      imageUrl: picks[0].imageUrl,
    });
    const advertisement = ad.advertisement || ad;
    if (admin) await adminAdService.approveAdvertisement(advertisement._id.toString(), admin._id);
  }
}

// الطلبيات المبذورة متطابقة لكل صيدلية، فالأرصدة كلها متساوية. ندفع نسباً مختلفة
// من المسلَّم لتصير الأرصدة متفاوتة كما هي بالواقع.
async function varyBalances(warehouseId, warehouseUserId, pharmacies) {
  const shares = [0, 0.1, 0.2, 0.3, 0.4, 0.45];
  for (const [i, pharmacy] of pharmacies.entries()) {
    const delivered = await Order.find({ pharmacyId: pharmacy._id, warehouseId, status: 'delivered' }).select('finalPrice').lean();
    const total = delivered.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const amount = Math.floor(total * shares[i % shares.length]);
    if (amount < 1) continue;
    await paymentService.createPayment(warehouseId, warehouseUserId, {
      pharmacyId: pharmacy._id.toString(),
      amount,
      currency: 'SYP',
      method: 'cash',
      note: 'دفعة تجريبية',
      idempotencyKey: `showcase-payment-${pharmacy._id}`,
    });
  }
}

async function main() {
  await connectDB();
  if (await Warehouse.exists({})) {
    throw new Error('القاعدة فيها مستودعات. استعمل قاعدة فاضية.');
  }

  // مستودع واحد وطلبيات من مرحلة لكل صنف، بدل المستودعات الثلاثة الافتراضية.
  await exchangeRate.setManualRate(DEMO_USD_TO_SYP);

  demo.WAREHOUSES.splice(0, demo.WAREHOUSES.length, WAREHOUSE);
  demo.DEMO_ORDERS.splice(0, demo.DEMO_ORDERS.length,
    [0, 'pending', [['Paracetamol 500mg', 20], ['Omeprazole 20mg', 10]]],
    [0, 'pending', [['Amoxicillin 500mg', 15], ['Vitamin C 1000mg', 12]]],
    [0, 'out_for_delivery', [['Vitamin D 50000 IU', 10], ['Metformin 850mg', 25]]],
    [0, 'out_for_delivery', [['Ibuprofen 400mg', 30], ['Azithromycin 250mg', 8]]],
    [0, 'delivered', [['Amlodipine 5mg', 20], ['Atorvastatin 20mg', 10], ['Sunscreen SPF 50', 5]]]
  );

  await demo.seedDemoAdminIfNone();
  await demo.seedDemoDataIfEmpty();
  await seedDemoCatalogImages();
  await hideSensitiveProducts();

  const warehouseUser = await User.findOne({ phone: WAREHOUSE.phone, role: 'warehouse' });
  const warehouse = await Warehouse.findOne({ userId: warehouseUser._id });
  // لا حسم منصة ولا عمولة منصة: تُحفظ على كل طلبية لحظة إنشائها، لذا قبل الطلبيات.
  await Warehouse.updateOne({ _id: warehouse._id }, { $set: { discountRate: 0, commissionRate: 0 } });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const pharmacies = [];
  for (const [nameAr, nameEn, ownerName, phone, coordinates] of PHARMACIES) {
    const user = await User.create({ name: ownerName, phone, password: hash, role: 'pharmacy', status: 'active' });
    pharmacies.push(
      await Pharmacy.create({
        userId: user._id, nameAr, nameEn, ownerName, phone,
        address: 'اللاذقية', city: 'Latakia', areaType: 'city', addedBy: 'admin',
        location: { type: 'Point', coordinates },
      })
    );
  }

  // المناديب وصيدلياتهم قبل الطلبيات، فتُنسب كل طلبية لمندوب صيدليتها تلقائياً.
  const reps = [];
  for (const spec of REPS) {
    const rep = await repService.createRep(warehouse._id, { name: spec.name, phone: spec.phone, password: PASSWORD });
    // حساب تجريبي: ندخل بدون شاشة «اختر كلمة سر جديدة».
    await User.updateOne({ _id: rep.userId }, { $set: { mustChangePassword: false } });
    for (const index of spec.pharmacies) {
      await repService.assignPharmacy(warehouse._id, warehouseUser._id, pharmacies[index]._id, rep._id);
    }
    reps.push(rep);
  }

  const orders = await demo.seedDemoOrders();
  await demo.turnOffDemoSealPhoto();
  const features = await seedDemoFeatures();
  await demo.seedDemoBonuses();
  await curatePromotions(warehouse._id, warehouseUser._id);
  await varyBalances(warehouse._id, warehouseUser._id, pharmacies);

  // زيارات موثّقة بمسح الباركود من موقع الصيدلية نفسه، موزّعة على الأيام الماضية.
  const now = Date.now();
  for (const [r, spec] of REPS.entries()) {
    const rep = reps[r];
    for (const [pharmacyIndex, daysAgo] of spec.visits) {
      const pharmacy = pharmacies[pharmacyIndex];
      const code = await visitCodes.getOrCreateVisitCode(pharmacy._id);
      const [longitude, latitude] = pharmacy.location.coordinates;
      await repPortal.recordVisit(
        rep.toObject ? rep.toObject() : rep,
        { code: visitCodes.qrPayloadFor(code), latitude, longitude, accuracy: 12, isMocked: false },
        new Date(now - daysAgo * DAY_MS - 3 * 60 * 60 * 1000)
      );
    }
  }

  const productCount = await Product.countDocuments({ warehouseId: warehouse._id });
  console.log(JSON.stringify({ warehouse: warehouse.nameAr, products: productCount, pharmacies: pharmacies.length, reps: reps.length, orders, features }, null, 2));
  console.log(`warehouse login: ${WAREHOUSE.phone} / ${PASSWORD}`);
  console.log(`pharmacy login: ${PHARMACIES[0][3]} / ${PASSWORD}`);
  console.log(`rep login: ${REPS[0].phone} / ${PASSWORD}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
