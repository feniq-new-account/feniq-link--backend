'use strict';
// Restores legacy demonstration catalog for existing active warehouse accounts.
// Does not create accounts, change credentials, or touch orders/payments/ledger.
// Existing products and offers are never overwritten.
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Category = require('../src/models/category.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');
const { normalizeText } = require('../src/utils/normalizeText');

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

async function restore({ write = false } = {}) {
  const report = [];
  for (const d of WAREHOUSES) {
    const user = await User.findOne({ phone: d.phone, role: 'warehouse', status: 'active' });
    if (!user) { report.push({ warehouse: d.nameAr, status: 'ACCOUNT_REQUIRED' }); continue; }
    let warehouse = await Warehouse.findOne({ userId: user._id });
    if (!warehouse && write) {
      warehouse = await Warehouse.create({ userId: user._id, nameAr: d.nameAr, nameEn: d.nameEn, address: d.address, city: d.city, phone: d.phone });
    }
    if (!warehouse) { report.push({ warehouse: d.nameAr, status: 'WAREHOUSE_WOULD_BE_CREATED' }); continue; }
    if (!warehouse.isActive) { report.push({ warehouse: d.nameAr, status: 'INACTIVE' }); continue; }
    let missing = 0;
    for (const [categoryEn, nameAr, nameEn, manufacturer, unit, price] of MEDICINES) {
      if (await Product.exists({ warehouseId: warehouse._id, nameEn })) continue;
      missing++;
      if (!write) continue;
      const definition = CATEGORIES.find(c => c.nameEn === categoryEn);
      const key = normalizeText(definition.nameAr);
      const category = await Category.findOneAndUpdate({ key }, { $setOnInsert: { ...definition, key } }, { upsert: true, new: true });
      await Product.create({ warehouseId: warehouse._id, categoryId: category._id, nameAr, nameEn, manufacturerAr: MANUFACTURERS[manufacturer].ar, manufacturerEn: MANUFACTURERS[manufacturer].en, price: Math.round(price * d.priceFactor * 100) / 100, unit, isAvailable: true });
    }
    const featured = await Product.findOne({ warehouseId: warehouse._id, nameEn: d.offerOn });
    if (write && featured && !(await Offer.exists({ productId: featured._id }))) {
      const now = Date.now();
      await Offer.create({ warehouseId: warehouse._id, productId: featured._id, titleAr: 'عرض تجريبي', titleEn: 'Demo offer', discountPercentage: d.discount, startDate: new Date(now - 86400000), endDate: new Date(now + 30 * 86400000), status: 'approved', approvedAt: new Date() });
    }
    report.push({ warehouse: d.nameAr, missingProducts: missing, status: write ? 'RESTORED_MISSING' : 'PREVIEW' });
  }
  return report;
}

if (require.main === module) {
  const write = process.argv.includes('--apply');
  if (write && process.env.FENIQ_PILOT_RESTORE_ACK !== 'RESTORE_DEMO_CATALOG') {
    console.error('Missing explicit restore acknowledgement');
    process.exit(1);
  }
  connectDB().then(() => restore({ write })).then(result => {
    process.stdout.write(JSON.stringify({ mode: write ? 'APPLY' : 'PREVIEW', result }, null, 2) + '\n');
  }).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}
module.exports = { restore };
