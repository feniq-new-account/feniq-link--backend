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

const samples = [
  ['مسكنات', 'باراسيتامول 500 ملغ', 'Paracetamol 500mg', 1.2],
  ['مسكنات', 'إيبوبروفين 400 ملغ', 'Ibuprofen 400mg', 1.6],
  ['مضادات حيوية', 'أموكسيسيلين 500 ملغ', 'Amoxicillin 500mg', 2.5],
  ['مضادات حيوية', 'أزيثروميسين 250 ملغ', 'Azithromycin 250mg', 3.2],
  ['فيتامينات', 'فيتامين د 50000 وحدة', 'Vitamin D 50000 IU', 2.2],
  ['فيتامينات', 'فيتامين سي 1000 ملغ', 'Vitamin C 1000mg', 1.8],
  ['أمراض مزمنة', 'ميتفورمين 850 ملغ', 'Metformin 850mg', 1.3],
  ['جهاز هضمي', 'أوميبرازول 20 ملغ', 'Omeprazole 20mg', 1.9]
];
const demos = [
  { phone: '0930000101', nameAr: 'مستودع النجاح', nameEn: 'Al-Najah Warehouse', address: 'شارع 8 آذار', city: 'Latakia', featured: 'Paracetamol 500mg', discount: 15 },
  { phone: '0930000102', nameAr: 'مستودع الشفاء', nameEn: 'Al-Shifa Warehouse', address: 'شارع بغداد', city: 'Latakia', featured: 'Amoxicillin 500mg', discount: 10 },
  { phone: '0930000103', nameAr: 'مستودع الأمل', nameEn: 'Al-Amal Warehouse', address: 'شارع الثورة', city: 'Latakia', featured: 'Vitamin D 50000 IU', discount: 20 }
];

async function restore({ write = false } = {}) {
  const report = [];
  for (const d of demos) {
    const user = await User.findOne({ phone: d.phone, role: 'warehouse', status: 'active' });
    if (!user) { report.push({ warehouse: d.nameAr, status: 'ACCOUNT_REQUIRED' }); continue; }
    let warehouse = await Warehouse.findOne({ userId: user._id });
    if (!warehouse && write) {
      warehouse = await Warehouse.create({ userId: user._id, nameAr: d.nameAr, nameEn: d.nameEn, address: d.address, city: d.city, phone: d.phone });
    }
    if (!warehouse) { report.push({ warehouse: d.nameAr, status: 'WAREHOUSE_WOULD_BE_CREATED' }); continue; }
    if (!warehouse.isActive) { report.push({ warehouse: d.nameAr, status: 'INACTIVE' }); continue; }
    let missing = 0;
    for (const [categoryName, nameAr, nameEn, price] of samples) {
      if (await Product.exists({ warehouseId: warehouse._id, nameEn })) continue;
      missing++;
      if (!write) continue;
      const key = normalizeText(categoryName);
      const category = await Category.findOneAndUpdate({ key }, { $setOnInsert: { key, nameAr: categoryName, nameEn: categoryName } }, { upsert: true, new: true });
      await Product.create({ warehouseId: warehouse._id, categoryId: category._id, nameAr, nameEn, price, unit: 'box', isAvailable: true });
    }
    const featured = await Product.findOne({ warehouseId: warehouse._id, nameEn: d.featured });
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
  connectDB().then(() => restore({ write })).then(result => {
    process.stdout.write(JSON.stringify({ mode: write ? 'APPLY' : 'PREVIEW', result }, null, 2) + '\n');
  }).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}
module.exports = { restore };
