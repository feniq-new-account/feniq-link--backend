// The central Manufacturer entity and the normalized keys (catalog overhaul
// §1.1-§1.5): spelling variants resolve to one manufacturer, catalog identity
// is unique after normalization, products carry synced search keys, renames
// and merges rewrite every copy, and manufacturer discounts match by id (M3).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-manufacturer-entity-tests-000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ManufacturerDiscount = require('../src/models/manufacturerDiscount.model');
const WarehouseManufacturer = require('../src/models/warehouseManufacturer.model');

const { updateCatalogItem } = require('../src/services/productCatalog.service');
const { updateManufacturer, mergeManufacturers } = require('../src/services/manufacturer.service');
const { registerManufacturers } = require('../src/services/warehouseManufacturer.service');
const { createDiscount } = require('../src/services/manufacturerDiscount.service');
const {
  listWarehouseProducts,
  listManufacturersWithDiscountsForWarehouse,
} = require('../src/services/product.service');

const expectCode = (code) => (err) => {
  assert.strictEqual(err.code, code);
  return true;
};

let seq = 0;
async function makeWarehouse() {
  seq += 1;
  const phone = `09430${String(seq).padStart(5, '0')}`;
  const user = await User.create({ name: `WH${seq}`, phone, role: 'warehouse', status: 'active' });
  return Warehouse.create({
    userId: user._id,
    nameAr: `مستودع ${seq}`,
    nameEn: `Warehouse ${seq}`,
    address: 'r',
    city: 'Latakia',
    phone,
    isActive: true,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-manufacturer-entity-test' });
  await syncIndexes(Manufacturer, ProductCatalog, Product, ManufacturerDiscount, WarehouseManufacturer);
});

test.after(async () => {
  await stopMemoryMongo();
});

test.beforeEach(async () => {
  await Promise.all([
    Product.deleteMany({}),
    ProductCatalog.deleteMany({}),
    Manufacturer.deleteMany({}),
    ManufacturerDiscount.deleteMany({}),
    WarehouseManufacturer.deleteMany({}),
  ]);
});

test('spelling variants of a manufacturer resolve to ONE Manufacturer, and the copy follows its spelling', async () => {
  const a = await ProductCatalog.create({ nameAr: 'باراسيتامول', manufacturerAr: 'شركة الشرق' });
  const b = await ProductCatalog.create({ nameAr: 'فيتامين سي', manufacturerAr: 'شركه  الشرق' });

  assert.strictEqual(await Manufacturer.countDocuments(), 1);
  assert.strictEqual(String(a.manufacturerId), String(b.manufacturerId));
  assert.strictEqual(b.manufacturerAr, 'شركة الشرق');
  assert.strictEqual(a.manufacturerKey, b.manufacturerKey);
});

test('catalog identity is unique after normalization (hamza / spacing / case variants)', async () => {
  await ProductCatalog.create({ nameAr: 'أموكسيسيلين 500', manufacturerAr: 'Pharma Co' });
  await assert.rejects(
    ProductCatalog.create({ nameAr: 'اموكسيسيلين  ٥٠٠', manufacturerAr: 'pharma co' }),
    (err) => err.code === 11000
  );
});

test('a product copies its catalog item\'s search keys and manufacturer on create', async () => {
  const warehouse = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'إيبوبروفين', nameEn: 'Ibuprofen', manufacturerAr: 'ابن سينا' });
  const product = await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, price: 2 });

  assert.strictEqual(product.nameKey, 'ايبوبروفين');
  assert.strictEqual(product.nameEnKey, 'ibuprofen');
  assert.strictEqual(product.manufacturerKey, item.manufacturerKey);
  assert.strictEqual(String(product.manufacturerId), String(item.manufacturerId));
});

test('a catalog rename rewrites the linked products\' search keys in the same transaction', async () => {
  const warehouse = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'دواء قديم', manufacturerAr: 'ش' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, price: 1 });

  await updateCatalogItem(item._id, { nameAr: 'دواء جديد' }, { confirmed: true });
  const product = await Product.findOne({ masterProductId: item._id }).lean();
  assert.strictEqual(product.nameKey, 'دواء جديد');
});

test('renaming a manufacturer syncs catalog items (incl. identityKey), products, discounts and the registry', async () => {
  const warehouse = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'دواء', manufacturerAr: 'الاسم القديم' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, price: 1 });
  await registerManufacturers(warehouse._id, ['الاسم القديم']);
  await createDiscount(warehouse._id, { manufacturerAr: 'الاسم القديم', discountPercentage: 5 });

  await updateManufacturer(item.manufacturerId, { nameAr: 'الاسم الجديد', nameEn: 'New Name' });

  const [freshItem, product, discount, registry] = await Promise.all([
    ProductCatalog.findById(item._id).lean(),
    Product.findOne({ masterProductId: item._id }).lean(),
    ManufacturerDiscount.findOne({ warehouseId: warehouse._id }).lean(),
    WarehouseManufacturer.findOne({ warehouseId: warehouse._id }).lean(),
  ]);
  assert.strictEqual(freshItem.manufacturerAr, 'الاسم الجديد');
  assert.strictEqual(freshItem.manufacturerKey, 'الاسم الجديد');
  assert.strictEqual(freshItem.identityKey, 'دواء|الاسم الجديد');
  assert.strictEqual(product.manufacturerKey, 'الاسم الجديد');
  assert.strictEqual(discount.manufacturerAr, 'الاسم الجديد');
  assert.strictEqual(registry.manufacturerAr, 'الاسم الجديد');
});

test('renaming onto another manufacturer\'s name is refused as a merge candidate', async () => {
  const a = await ProductCatalog.create({ nameAr: 'دواء1', manufacturerAr: 'شركة أ' });
  const b = await ProductCatalog.create({ nameAr: 'دواء2', manufacturerAr: 'شركة ب' });
  await assert.rejects(
    updateManufacturer(a.manufacturerId, { nameAr: 'شركه ب' }),
    (err) => {
      assert.strictEqual(err.code, 'MANUFACTURER_ALREADY_EXISTS');
      assert.strictEqual(String(err.details.manufacturerId), String(b.manufacturerId));
      return true;
    }
  );
});

test('merging two manufacturers moves items, products, discounts (higher kept) and registry, and keeps a logo', async () => {
  const warehouse = await makeWarehouse();
  const target = await ProductCatalog.create({ nameAr: 'دواء أ', manufacturerAr: 'الهدف' });
  const source = await ProductCatalog.create({ nameAr: 'دواء ب', manufacturerAr: 'المصدر' });
  await Manufacturer.updateOne({ _id: source.manufacturerId }, { $set: { logoUrl: 'https://res.cloudinary.com/x/logo.png' } });
  await Product.create({ warehouseId: warehouse._id, masterProductId: source._id, price: 3 });
  await registerManufacturers(warehouse._id, ['الهدف', 'المصدر']);
  await createDiscount(warehouse._id, { manufacturerAr: 'الهدف', discountPercentage: 5 });
  await createDiscount(warehouse._id, { manufacturerAr: 'المصدر', discountPercentage: 12.5 });

  const result = await mergeManufacturers(target.manufacturerId, source.manufacturerId);

  assert.strictEqual(await Manufacturer.exists({ _id: source.manufacturerId }), null);
  const merged = await Manufacturer.findById(target.manufacturerId).lean();
  assert.strictEqual(merged.logoUrl, 'https://res.cloudinary.com/x/logo.png');
  const movedItem = await ProductCatalog.findById(source._id).lean();
  assert.strictEqual(String(movedItem.manufacturerId), String(target.manufacturerId));
  assert.strictEqual(movedItem.manufacturerAr, 'الهدف');
  const product = await Product.findOne({ masterProductId: source._id }).lean();
  assert.strictEqual(String(product.manufacturerId), String(target.manufacturerId));

  const discounts = await ManufacturerDiscount.find({ warehouseId: warehouse._id }).lean();
  assert.strictEqual(discounts.length, 1);
  assert.strictEqual(discounts[0].discountPercentage, 12.5);
  assert.deepStrictEqual(
    result.discountClashes.map((c) => [c.kept, c.dropped]),
    [[12.5, 5]]
  );
  assert.strictEqual(await WarehouseManufacturer.countDocuments({ warehouseId: warehouse._id }), 1);
});

test('merging folds a medicine that exists under both manufacturers when that is safe', async () => {
  const warehouse = await makeWarehouse();
  const target = await ProductCatalog.create({ nameAr: 'بانادول', manufacturerAr: 'الهدف2' });
  const source = await ProductCatalog.create({ nameAr: 'بانادول', manufacturerAr: 'المصدر2', imageUrl: 'https://res.cloudinary.com/x/p.png' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: source._id, price: 1 });

  const result = await mergeManufacturers(target.manufacturerId, source.manufacturerId);
  assert.strictEqual(result.mergedCatalogPairs, 1);
  assert.strictEqual(await ProductCatalog.exists({ _id: source._id }), null);
  const survivor = await ProductCatalog.findById(target._id).lean();
  assert.strictEqual(survivor.imageUrl, 'https://res.cloudinary.com/x/p.png');
  const product = await Product.findOne({ warehouseId: warehouse._id }).lean();
  assert.strictEqual(String(product.masterProductId), String(target._id));
});

test('merging is refused when a warehouse stocks the same medicine under both manufacturers', async () => {
  const warehouse = await makeWarehouse();
  const target = await ProductCatalog.create({ nameAr: 'بروفين', manufacturerAr: 'الهدف3' });
  const source = await ProductCatalog.create({ nameAr: 'بروفين', manufacturerAr: 'المصدر3' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: target._id, price: 1 });
  await Product.create({ warehouseId: warehouse._id, masterProductId: source._id, price: 1 });

  await assert.rejects(mergeManufacturers(target.manufacturerId, source.manufacturerId), expectCode('MANUFACTURER_MERGE_CONFLICT'));
  assert.ok(await Manufacturer.exists({ _id: source.manufacturerId }));
});

test('M3: a discount registered under a spelling variant still reaches the catalog-linked products', async () => {
  const warehouse = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'فولتارين', manufacturerAr: 'شركة الشرق' });
  await Product.create({ warehouseId: warehouse._id, masterProductId: item._id, price: 10 });
  // The import file spelled it differently.
  await registerManufacturers(warehouse._id, ['شركه  الشرق']);
  await createDiscount(warehouse._id, { manufacturerAr: 'شركه  الشرق', discountPercentage: 10 });

  const { items } = await listWarehouseProducts(warehouse._id, { manufacturer: 'شركة الشرق' });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].manufacturerDiscountPercentage, 10);
});

test('the pharmacist manufacturers list adds manufacturerId and logoUrl, keeping the old fields', async () => {
  const warehouse = await makeWarehouse();
  const item = await ProductCatalog.create({ nameAr: 'دواء', manufacturerAr: 'بشعار' });
  await ProductCatalog.create({ nameAr: 'دواء', manufacturerAr: 'بلا شعار' });
  await Manufacturer.updateOne({ _id: item.manufacturerId }, { $set: { logoUrl: 'https://res.cloudinary.com/x/l.png' } });
  const items = await ProductCatalog.find().lean();
  await Product.create(items.map((i) => ({ warehouseId: warehouse._id, masterProductId: i._id, price: 1 })));

  const list = await listManufacturersWithDiscountsForWarehouse(warehouse._id);
  assert.deepStrictEqual(
    list.map((m) => [m.manufacturerAr, m.discountPercentage, m.logoUrl]),
    [
      ['بشعار', 0, 'https://res.cloudinary.com/x/l.png'],
      ['بلا شعار', 0, null],
    ]
  );
  assert.ok(list.every((m) => m.manufacturerId));
});

test('a manufacturer discount accepts decimals; 0 and >100 are refused with 400, not a 500', async () => {
  const warehouse = await makeWarehouse();
  await ProductCatalog.create({ nameAr: 'دواء', manufacturerAr: 'عشري' });
  await registerManufacturers(warehouse._id, ['عشري']);
  const discount = await createDiscount(warehouse._id, { manufacturerAr: 'عشري', discountPercentage: 0.5 });
  assert.strictEqual(discount.discountPercentage, 0.5);
  await ManufacturerDiscount.deleteMany({});
  await assert.rejects(createDiscount(warehouse._id, { manufacturerAr: 'عشري', discountPercentage: 0 }), expectCode('INVALID_DISCOUNT_PERCENTAGE'));
  await assert.rejects(createDiscount(warehouse._id, { manufacturerAr: 'عشري', discountPercentage: 100.5 }), expectCode('INVALID_DISCOUNT_PERCENTAGE'));
});
