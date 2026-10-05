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

// [file, name, manufacturer, strength, dosage form, unit, price USD]
const ITEMS = [
  ['e691583fcfe7bfbe', 'SPASMOLGIN CTD TAB.', 'آسيا', null, 'أقراص ملبسة', 'box', 3.2],
  ['eb94b187107b853b', 'GLUCOMET-500 TAB.', 'آسيا', '500 MG', 'أقراص', 'box', 1.1],
  ['7b018a8e512b849c', 'ROZIFAX-1000 VIAL', 'آسيا', '1000 MG', 'فيال', 'vial', 1.6],
  ['2cc8ebca0ec971d2', 'HYDRODERM CREAM (30 G)', 'بحري', '1 %', 'كريم', 'tube', 1.4],
  ['3cd5a53958012629', 'DEPAK SYRUP (200 ML)', 'بحري', '200 MG/5 ML', 'شراب', 'bottle', 2.9],
  ['956de5e070bb2805', 'BURN-HEAL CREAM (50 G)', 'بحري', null, 'كريم', 'tube', 1.8],
  ['e8fec5103296213a', 'COTAGIZEC CTD TAB.', 'شفا', null, 'أقراص ملبسة', 'box', 2.4],
  ['6cbc47852ddaba4d', 'LIDO-2 % AMP.', 'شفا', '2 %', 'أمبولات', 'ampoule', 0.3],
  ['4823bf9d2b16f600', 'ROCEF-2000 VIAL', 'شفا', '2000 MG', 'فيال', 'vial', 2.1],
  ['ba298f0c6414eac0', 'TRAGLIPTIN TAB.', 'بركات', '5 MG', 'أقراص', 'box', 4.5],
  ['d995ba0c4e7b3cd1', 'TOLIDON CTD TAB.', 'بركات', null, 'أقراص ملبسة', 'box', 2.2],
  ['6aaf4d7c66c0e1ed', 'TRAMAL AMP.', 'ابن زهر', '100 MG/2 ML', 'أمبولات', 'ampoule', 0.9],
  ['0ed1eb0b8d01d98e', 'TICALOR TAB.', 'ابن زهر', '90 MG', 'أقراص ملبسة', 'box', 9.5],
  ['77b3f0beb4acbea6', 'BROMAZEPAM HUMAN-1.5 CAP.', 'هيومن فارما', '1.5 MG', 'محافظ', 'box', 1.3],
  ['0db1427f08168bb4', 'COVIAN 160/12.5 TAB.', 'هيومن فارما', '160/12.5 MG', 'أقراص ملبسة', 'box', 3.6],
  ['16f5e7bd71f8ec7c', 'NEOSTATINE SUSP. (60 ML)', 'الشهباء', '100000 IU/ML', 'معلق', 'bottle', 1.5],
  ['d345cfcd1d0f6747', 'LOWVASC 20/5 TAB.', 'زين فارما', '20/5 MG', 'أقراص', 'box', 3.9],
  ['54738238b310df04', 'VISITO-TROP 1% EYE DROPS', 'دومنا', '1 %', 'قطرة عينية', 'bottle', 1.7],
  ['dc10e61f09240ddd', 'DE-HISTAMINE TAB.', 'السعد', '4 MG', 'أقراص', 'box', 0.8],
  ['b7a0338347a630ef', 'GABALYR-150 CAP.', 'السعد', '150 MG', 'محافظ', 'box', 3.4],
  ['c37a08caac383819', 'METFORMIN-ELSAAD 1000 F.CTD TAB.', 'السعد', '1000 MG', 'أقراص ملبسة', 'box', 1.6],
  ['eb8b051374cec3a2', 'POVI TEARS EYE DROP (15 ML)', 'دياموند فارما', null, 'قطرة عينية', 'bottle', 2.3],
  ['57823f5031c4349f', 'VERMORAM SUSP. (30 ML)', 'راما', '100 MG/5 ML', 'معلق', 'bottle', 1.2],
  ['8e560f98b39ebbda', 'CARTE SYRUP (5 ML)', 'راما', null, 'شراب', 'bottle', 1.9],
];

async function findOrCreateCatalogItem([file, name, manufacturer, strength, dosageForm, unit]) {
  let item = await ProductCatalog.findOne({ nameAr: name, manufacturerAr: manufacturer });
  if (!item) {
    item = await ProductCatalog.create({
      nameAr: name,
      nameEn: name,
      manufacturerAr: manufacturer,
      strength,
      dosageForm,
      unitAr: null,
      imageMatch: 'exact',
    });
  }
  if (!item.imageUrl) {
    const buffer = await fs.readFile(path.join(IMAGES_DIR, `${file}.webp`));
    item.imageUrl = await uploadImage(buffer, 'catalog');
    await item.save();
  }
  return { item, unit };
}

async function seedDemoCatalogImages() {
  const users = await User.find({ phone: { $in: WAREHOUSES.map((w) => w.phone) }, role: 'warehouse' })
    .select('_id')
    .lean();
  const warehouses = await Warehouse.find({ userId: { $in: users.map((u) => u._id) } })
    .select('_id')
    .lean();
  if (warehouses.length === 0) return null;

  let uploaded = 0;
  let stocked = 0;
  for (const [index, row] of ITEMS.entries()) {
    let catalog;
    try {
      const hadImage = await ProductCatalog.exists({ nameAr: row[1], manufacturerAr: row[2], imageUrl: { $ne: null } });
      catalog = await findOrCreateCatalogItem(row);
      if (!hadImage) uploaded += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Demo image ${row[1]} failed:`, err.message);
      continue;
    }

    for (const [w, warehouse] of warehouses.entries()) {
      if (await Product.exists({ warehouseId: warehouse._id, masterProductId: catalog.item._id })) continue;
      // Each warehouse prices a little differently, and skips a few items, so
      // comparing warehouses shows something.
      if ((index + w) % 5 === 4) continue;
      await Product.create({
        warehouseId: warehouse._id,
        masterProductId: catalog.item._id,
        unit: catalog.unit,
        price: Math.round(row[6] * (1 + w * 0.04) * 100) / 100,
        isAvailable: true,
      });
      stocked += 1;
    }
  }
  return { uploaded, stocked };
}

module.exports = { seedDemoCatalogImages, ITEMS };
