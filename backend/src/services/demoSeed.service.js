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

module.exports = { seedDemoDataIfEmpty, DEMO_WAREHOUSE_PASSWORD, WAREHOUSES };
