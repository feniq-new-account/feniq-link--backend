// Real medicines with real pictures for the demo warehouses: 24 items from the
// collected picture pack (data/catalog-images), each uploaded through the
// normal image path (Cloudinary, or MEDIA_DIR when set) into a catalog item,
// and stocked by every demo warehouse. Lets the app be tried with images.
//
// Runs on boot after the demo seed. Idempotent: a catalog item that already
// exists with a picture is reused, so the images are uploaded once, ever.
const fs = require('node:fs/promises');
const path = require('node:path');
const User = require('../models/user.model');
const Warehouse = require('../models/warehouse.model');
const Product = require('../models/product.model');
const ProductCatalog = require('../models/productCatalog.model');
const { uploadImage } = require('./upload.service');
const { WAREHOUSES } = require('./demoSeed.service');

const IMAGES_DIR = path.join(__dirname, '..', 'data', 'demo-images');

// The demo medicines: name, company, strength, dosage form, active
// ingredient, unit and price, each with its picture file in data/demo-images.
const ITEMS = require('../data/demo-catalog.json');
const LOGOS_DIR = path.join(__dirname, '..', 'data', 'demo-logos');

async function findOrCreateCatalogItem(row) {
  let item = await ProductCatalog.findOne({ nameAr: row.name, manufacturerAr: row.manufacturer });
  if (!item) {
    item = await ProductCatalog.create({
      nameAr: row.name,
      nameEn: row.name,
      manufacturerAr: row.manufacturer,
      strength: row.strength,
      dosageForm: row.dosageForm,
      activeIngredient: row.activeIngredient,
      unitAr: null,
      imageMatch: 'exact',
    });
  } else if (!item.activeIngredient && row.activeIngredient) {
    // Items seeded before the ingredient was part of the demo data.
    item.activeIngredient = row.activeIngredient;
    if (!item.strength && row.strength) item.strength = row.strength;
    if (!item.dosageForm && row.dosageForm) item.dosageForm = row.dosageForm;
    await item.save();
  }
  if (!item.imageUrl) {
    const buffer = await fs.readFile(path.join(IMAGES_DIR, `${row.file}.webp`));
    item.imageUrl = await uploadImage(buffer, 'catalog');
    await item.save();
  }
  return item;
}

// The first demo medicines (demoSeed.service.js MEDICINES) were created as
// standalone products with no catalog item, so they had no active
// ingredient. Each gets a catalog item carrying its ingredient, strength and
// form, and is linked to it.
const LEGACY_FACTS = {
  'Paracetamol 500mg': ['PARACETAMOL', '500 MG', 'أقراص'],
  'Ibuprofen 400mg': ['IBUPROFEN', '400 MG', 'أقراص ملبسة'],
  'Diclofenac 50mg': ['DICLOFENAC SODIUM', '50 MG', 'أقراص ملبسة'],
  'Diclofenac 75mg': ['DICLOFENAC SODIUM', '75 MG/3 ML', 'أمبولات'],
  'Amoxicillin 500mg': ['AMOXICILLIN', '500 MG', 'محافظ'],
  'Amoxicillin/Clavulanate 1g': ['AMOXICILLIN + CLAVULANIC ACID', '875/125 MG', 'أقراص ملبسة'],
  'Azithromycin 250mg': ['AZITHROMYCIN', '250 MG', 'محافظ'],
  'Ceftriaxone 1g': ['CEFTRIAXONE', '1 G', 'فيال'],
  'Vitamin D 50000 IU': ['CHOLECALCIFEROL', '50000 IU', 'محافظ'],
  'Vitamin C 1000mg': ['ASCORBIC ACID', '1000 MG', 'أقراص فوارة'],
  'Iron + Folic Acid': ['FERROUS SULFATE + FOLIC ACID', '150/0.5 MG', 'محافظ'],
  'Metformin 850mg': ['METFORMIN', '850 MG', 'أقراص ملبسة'],
  'Amlodipine 5mg': ['AMLODIPINE', '5 MG', 'أقراص'],
  'Atorvastatin 20mg': ['ATORVASTATIN', '20 MG', 'أقراص ملبسة'],
  'Omeprazole 20mg': ['OMEPRAZOLE', '20 MG', 'محافظ'],
  'Domperidone 10mg': ['DOMPERIDONE', '10 MG', 'أقراص'],
  'Moisturizing Cream': ['UREA + GLYCERIN', '10 %', 'كريم'],
  'Sunscreen SPF 50': ['ZINC OXIDE + TITANIUM DIOXIDE', 'SPF 50', 'كريم'],
};

async function linkLegacyProducts(warehouseIds) {
  const legacy = await Product.find({ warehouseId: { $in: warehouseIds }, masterProductId: null });
  let linked = 0;
  for (const product of legacy) {
    const facts = LEGACY_FACTS[product.nameEn];
    if (!facts) continue;
    const [activeIngredient, strength, dosageForm] = facts;
    let item = await ProductCatalog.findOne({ nameAr: product.nameAr, manufacturerAr: product.manufacturerAr });
    if (!item) {
      item = await ProductCatalog.create({
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        manufacturerAr: product.manufacturerAr,
        manufacturerEn: product.manufacturerEn,
        categoryId: product.categoryId,
        activeIngredient,
        strength,
        dosageForm,
      });
    }
    product.masterProductId = item._id;
    await product.save();
    linked += 1;
  }
  return linked;
}

// A logo for each demo warehouse (data/demo-logos/<phone>.png), uploaded once.
async function addDemoLogos(users) {
  let added = 0;
  for (const user of users) {
    const warehouse = await Warehouse.findOne({ userId: user._id, logo: null });
    if (!warehouse) continue;
    try {
      const buffer = await fs.readFile(path.join(LOGOS_DIR, `${user.phone}.png`));
      warehouse.logo = await uploadImage(buffer, 'warehouses');
      await warehouse.save();
      added += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Demo logo for ${user.phone} failed:`, err.message);
    }
  }
  return added;
}

// Exceptional discount offers on about one demo product in six, so the cards
// show a price before and after the discount. Only where no offer is running.
async function addDemoDiscounts(warehouseIds) {
  const Offer = require('../models/offer.model');
  if ((await Offer.countDocuments({ warehouseId: { $in: warehouseIds } })) > 3) return 0;
  const products = await Product.find({ warehouseId: { $in: warehouseIds } }).select('_id warehouseId').sort({ _id: 1 }).lean();
  const busy = new Set((await Offer.find({ warehouseId: { $in: warehouseIds } }).select('productId').lean()).map((o) => o.productId.toString()));
  const now = new Date();
  const docs = products
    .filter((p, i) => i % 6 === 2 && !busy.has(p._id.toString()))
    .map((p, i) => ({
      warehouseId: p.warehouseId,
      productId: p._id,
      titleAr: ['عرض الشهر', 'تصفية مخزون', 'عرض قرب انتهاء الصلاحية'][i % 3],
      titleEn: ['Offer of the month', 'Stock clearance', 'Near-expiry offer'][i % 3],
      discountPercentage: [10, 15, 20, 25][i % 4],
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      status: 'approved',
      approvedAt: now,
    }));
  if (docs.length) await Offer.insertMany(docs);
  return docs.length;
}

async function seedDemoCatalogImages() {
  const users = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' })
    .select('_id phone')
    .lean();
  const warehouses = await Warehouse.find({ userId: { $in: users.map((u) => u._id) } })
    .select('_id')
    .lean();
  if (warehouses.length === 0) return null;
  const warehouseIds = warehouses.map((w) => w._id);

  let uploaded = 0;
  let stocked = 0;
  for (const [index, row] of ITEMS.entries()) {
    let item;
    try {
      const hadImage = await ProductCatalog.exists({ nameAr: row.name, manufacturerAr: row.manufacturer, imageUrl: { $ne: null } });
      item = await findOrCreateCatalogItem(row);
      if (!hadImage) uploaded += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Demo image ${row.name} failed:`, err.message);
      continue;
    }

    for (const [w, warehouse] of warehouses.entries()) {
      if (await Product.exists({ warehouseId: warehouse._id, masterProductId: item._id })) continue;
      // Each warehouse prices a little differently, and skips a few items, so
      // comparing warehouses shows something.
      if ((index + w) % 5 === 4) continue;
      await Product.create({
        warehouseId: warehouse._id,
        masterProductId: item._id,
        unit: row.unit,
        price: Math.round(row.priceUsd * (1 + w * 0.04) * 100) / 100,
        isAvailable: true,
      });
      stocked += 1;
    }
  }
  const linked = await linkLegacyProducts(warehouseIds);
  const logos = await addDemoLogos(users);
  const discounts = await addDemoDiscounts(warehouseIds);
  const dated = await dateDemoProducts(warehouseIds);
  return { uploaded, stocked, linked, logos, discounts, dated };
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// A production and expiry date on every demo product that has none, varied
// per product so the cards don't all read the same.
async function dateDemoProducts(warehouseIds) {
  const products = await Product.find({ warehouseId: { $in: warehouseIds }, expiryDate: null }).select('_id').lean();
  const now = Date.now();
  const operations = products.map((product, i) => {
    const produced = new Date(now - (2 + (i % 11)) * MONTH_MS);
    const expires = new Date(produced.getTime() + (18 + (i % 4) * 6) * MONTH_MS);
    return {
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { productionDate: produced, expiryDate: expires } },
      },
    };
  });
  if (operations.length) await Product.bulkWrite(operations);
  return operations.length;
}

module.exports = { seedDemoCatalogImages, ITEMS };
