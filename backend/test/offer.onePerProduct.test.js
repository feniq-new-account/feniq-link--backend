// Catalog overhaul Phase 6 - one offer per product, one deterministic offer
// choice (catalog = offers tab = order), and the paginated active lists.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-one-offer-per-product-0000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');

const warehouseOfferService = require('../src/services/warehouseOffer.service');
const adminOfferService = require('../src/services/adminOffer.service');
const offerService = require('../src/services/offer.service');
const orderService = require('../src/services/order.service');
const { listWarehouseProducts } = require('../src/services/product.service');

const RATE = 100;
const ids = {};

const expectCode = (code) => (err) => {
  assert.strictEqual(err.code, code);
  return true;
};

const DAY = 86400000;
function offerBody(productId, extra = {}) {
  return {
    productId: String(productId),
    titleAr: 'عرض',
    titleEn: 'Offer',
    discountPercentage: 10,
    startDate: new Date(Date.now() - DAY).toISOString(),
    endDate: new Date(Date.now() + DAY).toISOString(),
    ...extra,
  };
}

async function newProduct(price = 10) {
  return Product.create({
    warehouseId: ids.warehouse,
    nameAr: `دواء ${Math.random()}`,
    nameEn: 'Drug',
    manufacturerAr: 'شركة',
    price,
    unitAr: 'علبة',
    unitEn: 'box',
    isAvailable: true,
    isActive: true,
  });
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-one-offer-test' });
  await syncIndexes(Order, OrderItem, Offer);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual' });
  const [phUser, whUser, admin] = await User.create([
    { name: 'Ph', phone: '0931000901', role: 'pharmacy', status: 'active' },
    { name: 'WH', phone: '0941000901', role: 'warehouse', status: 'active' },
    { name: 'Admin', phone: '0951000901', role: 'admin', status: 'active' },
  ]);
  ids.pharmacyUser = phUser._id;
  ids.admin = admin._id;
  const pharmacy = await Pharmacy.create({
    userId: phUser._id, nameAr: 'ص', nameEn: 'Pharmacy', ownerName: 'O',
    address: 'a', city: 'Latakia', areaType: 'city', phone: '0931000901', addedBy: 'self',
  });
  ids.pharmacy = pharmacy._id;
  const warehouse = await Warehouse.create({
    userId: whUser._id, nameAr: 'م', nameEn: 'Warehouse', address: 'r', city: 'Latakia',
    phone: '0941000901', deliveryType: 'self', isActive: true, discountRate: 0, commissionRate: 0,
  });
  ids.warehouse = warehouse._id;
});

test.after(async () => {
  await stopMemoryMongo();
});

test('a product with a pending or running offer cannot get a second one', async () => {
  const product = await newProduct();
  const { offer } = await warehouseOfferService.createOffer(ids.warehouse, offerBody(product._id));
  await assert.rejects(warehouseOfferService.createOffer(ids.warehouse, offerBody(product._id)), expectCode('OFFER_ALREADY_EXISTS'));

  await adminOfferService.approveOffer(offer._id, ids.admin);
  await assert.rejects(warehouseOfferService.createOffer(ids.warehouse, offerBody(product._id)), expectCode('OFFER_ALREADY_EXISTS'));
});

test('an expired or stopped offer does not block a new one', async () => {
  const expired = await newProduct();
  await Offer.create({
    warehouseId: ids.warehouse, productId: expired._id, titleAr: 'x', titleEn: 'x', discountPercentage: 5,
    startDate: new Date(Date.now() - 3 * DAY), endDate: new Date(Date.now() - DAY), status: 'approved',
  });
  await warehouseOfferService.createOffer(ids.warehouse, offerBody(expired._id));

  const stopped = await newProduct();
  await Offer.create({
    warehouseId: ids.warehouse, productId: stopped._id, titleAr: 'x', titleEn: 'x', discountPercentage: 5,
    startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), status: 'stopped',
  });
  await warehouseOfferService.createOffer(ids.warehouse, offerBody(stopped._id));
});

test('moving an offer onto a product that already has one is refused', async () => {
  const [a, b] = [await newProduct(), await newProduct()];
  const { offer } = await warehouseOfferService.createOffer(ids.warehouse, offerBody(a._id));
  await warehouseOfferService.createOffer(ids.warehouse, offerBody(b._id));
  await assert.rejects(warehouseOfferService.updateOffer(offer._id, ids.warehouse, offerBody(b._id)), expectCode('OFFER_ALREADY_EXISTS'));
});

test('approval re-checks the rule (legacy data with two pending offers)', async () => {
  const product = await newProduct();
  const base = {
    warehouseId: ids.warehouse, productId: product._id, titleAr: 'x', titleEn: 'x', discountPercentage: 5,
    startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), status: 'pending',
  };
  const [first, second] = await Offer.create([base, base]);
  await assert.rejects(adminOfferService.approveOffer(second._id, ids.admin), expectCode('OFFER_ALREADY_EXISTS'));
  assert.ok(first);
});

test('overlapping legacy offers: the catalog, the offers tab and the order all apply the same one', async () => {
  const product = await newProduct(10);
  const live = { warehouseId: ids.warehouse, productId: product._id, titleAr: 'x', titleEn: 'x',
    startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), status: 'approved' };
  const [low, high] = await Offer.create([
    { ...live, discountPercentage: 10, approvedAt: new Date() },
    { ...live, discountPercentage: 20, approvedAt: new Date(Date.now() - DAY) },
  ]);
  assert.strictEqual(String(offerService.pickOfferForProduct([low, high])._id), String(high._id));

  const { items } = await listWarehouseProducts(ids.warehouse, { limit: 100 });
  const catalogRow = items.find((row) => String(row.product._id) === String(product._id));
  assert.strictEqual(catalogRow.offer.discountPercentage, 20);

  const { rows } = await offerService.listActiveOffers({ limit: 100 });
  const tabRows = rows.filter((row) => String(row.product._id) === String(product._id));
  assert.deepStrictEqual(tabRows.map((row) => row.offer.discountPercentage), [20]);

  const order = await orderService.createOrder({
    userId: ids.pharmacyUser,
    pharmacyId: ids.pharmacy,
    warehouseId: ids.warehouse,
    items: [{ productId: String(product._id), quantity: 1, displayedUnitPriceUsd: 8 }],
    notes: null,
    idempotencyKey: null,
    rateUsed: RATE,
  });
  const item = await OrderItem.findOne({ orderId: order._id ?? order.order?._id }).lean();
  assert.strictEqual(item.discountPrice, 800); // $8 at 100 SYP/USD - the 20% offer
});

test('the active offers list is cursor-paginated', async () => {
  const products = [];
  for (let i = 0; i < 3; i += 1) products.push(await newProduct());
  for (const product of products) {
    await Offer.create({
      warehouseId: ids.warehouse, productId: product._id, titleAr: 'x', titleEn: 'x', discountPercentage: 5,
      startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), status: 'approved',
    });
  }
  const seen = new Set();
  let after = null;
  let pages = 0;
  do {
    const page = await offerService.listActiveOffers({ limit: 2, after });
    page.rows.forEach((row) => seen.add(String(row.offer._id)));
    after = page.hasMore ? page.nextCursor : null;
    pages += 1;
  } while (after && pages < 20);
  assert.ok(pages >= 2);
  const total = (await offerService.listActiveOffers({ limit: 100 })).rows.length;
  assert.strictEqual(seen.size, total);
});
