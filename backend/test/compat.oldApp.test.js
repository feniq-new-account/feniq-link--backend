// Old-app compatibility (catalog overhaul, pre-merge). The pharmacy app
// already installed on phones is the build on main (a0ff7cf): it cannot be
// updated in step with this backend, so every response it reads must still
// carry what its models parse, and the order it submits - no bonus field, no
// lira final price - must still go through.
//
// This file is the backend half. It seeds a catalog that exercises everything
// the overhaul added (a central manufacturer with a logo, an offer stacked on a
// manufacturer discount, a bonus, a unit, a legacy product, a package), then
// makes exactly the requests the old app makes, with its old parameters:
//
//   GET  /categories
//   GET  /warehouses/:id/manufacturers
//   GET  /warehouses/:id/products        (?limit, ?manufacturer, ?search)
//   GET  /offers/active                  (no parameters)
//   GET  /advertisements/active          (no parameters)
//   GET  /advertisements/:id/cart
//   POST /orders                         (the old request body, below)
//   GET  /orders/:id, GET /orders, POST /orders/:id/reorder
//
// The responses are recorded as fixtures in phoenix/test/compat/fixtures,
// which the Flutter half (phoenix/test/compat/old_app_compat_test.dart)
// parses with the OLD model classes, copied unchanged from main. The order
// body posted here is fixtures/order_request_old.json, and the Flutter half
// checks that the old OrderRepositoryImpl code builds exactly that body from
// carts made by the old models - so the two halves meet in the middle.
//
//   COMPAT_RECORD=1 node --test test/compat.oldApp.test.js   rewrite the fixtures
//   node --test test/compat.oldApp.test.js                   check against them
//
// In check mode, every field (path and type) in a recorded response must
// still be in the live one: a removed or renamed field fails here, before an
// installed app meets it.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-old-app-compat-tests-0000000';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { startMemoryMongo, stopMemoryMongo, syncIndexes } = require('./helpers/mongo');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/user.model');
const Pharmacy = require('../src/models/pharmacy.model');
const Warehouse = require('../src/models/warehouse.model');
const Category = require('../src/models/category.model');
const Manufacturer = require('../src/models/manufacturer.model');
const ProductCatalog = require('../src/models/productCatalog.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');
const Advertisement = require('../src/models/advertisement.model');
const Order = require('../src/models/order.model');
const OrderItem = require('../src/models/orderItem.model');
const ExchangeRate = require('../src/models/exchangeRate.model');
const { registerManufacturers } = require('../src/services/warehouseManufacturer.service');
const { createDiscount } = require('../src/services/manufacturerDiscount.service');

const FIXTURES = path.join(__dirname, '..', '..', 'phoenix', 'test', 'compat', 'fixtures');
const RECORD = process.env.COMPAT_RECORD === '1';

// A realistic lira rate, so the stacked discounts produce lira that need
// rounding - the case where an old app's USD-derived price could drift.
const RATE = 13000;

// Fixed ids: the fixtures (and the order body) refer to them.
const oid = (n) => new mongoose.Types.ObjectId(`6a0c0000000000000000${String(n).padStart(4, '0')}`);
const IDS = {
  pharmacyUser: oid(1),
  warehouseUser: oid(2),
  pharmacy: oid(3),
  warehouse: oid(4),
  category: oid(5),
  manufacturer: oid(6),
  catalogPanadol: oid(7),
  catalogAmoxil: oid(8),
  panadol: oid(9), // catalog-linked: offer + manufacturer discount + bonus + unit
  amoxil: oid(10), // catalog-linked, in the package
  legacy: oid(11), // no catalog link, free-text identity (pre-catalog data)
  offer: oid(12),
  advertisement: oid(13),
};

const tokens = {};
let server;
let baseUrl;
const recorded = {};

async function call(method, urlPath, body) {
  const init = { method, headers: { Authorization: `Bearer ${tokens.pharmacy}` } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(baseUrl + urlPath, init);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// Every leaf path in a JSON value, with its type ("a.b[].c" -> "string").
function shape(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item) => shape(item, `${prefix}[]`, out));
    if (value.length === 0) out.set(`${prefix}[]`, 'array');
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) shape(child, prefix ? `${prefix}.${key}` : key, out);
  } else {
    const type = value === null ? 'null' : typeof value;
    // A path seen both null and non-null keeps the non-null type.
    if (!out.has(prefix) || out.get(prefix) === 'null') out.set(prefix, type);
  }
  return out;
}

function fixturePath(name) {
  return path.join(FIXTURES, `${name}.json`);
}

// Record mode writes the response; check mode requires every recorded field
// (and its type, where it was not null) to be in the live response.
function recordOrCheck(name, body) {
  recorded[name] = body;
  if (RECORD) {
    fs.mkdirSync(FIXTURES, { recursive: true });
    fs.writeFileSync(fixturePath(name), `${JSON.stringify(body, null, 2)}\n`);
    return;
  }
  assert.ok(fs.existsSync(fixturePath(name)), `missing fixture ${name}.json - run with COMPAT_RECORD=1`);
  const expected = shape(JSON.parse(fs.readFileSync(fixturePath(name), 'utf8')));
  const live = shape(body);
  const missing = [];
  for (const [fieldPath, type] of expected) {
    if (!live.has(fieldPath)) {
      missing.push(fieldPath);
    } else if (type !== 'null' && live.get(fieldPath) !== 'null' && live.get(fieldPath) !== type) {
      missing.push(`${fieldPath} (was ${type}, now ${live.get(fieldPath)})`);
    }
  }
  assert.deepStrictEqual(missing, [], `${name}: fields the old app saw are gone or changed type`);
}

test.before(async () => {
  await startMemoryMongo({ dbName: 'feniq-old-app-compat-test' });
  await syncIndexes(Order, OrderItem, Product, ProductCatalog, Manufacturer);
  await ExchangeRate.create({ _id: 'singleton', usdToSyp: RATE, source: 'manual', manualOverride: true });

  await User.create([
    { _id: IDS.pharmacyUser, name: 'Ph', phone: '0931009001', role: 'pharmacy', status: 'active' },
    { _id: IDS.warehouseUser, name: 'WH', phone: '0941009001', role: 'warehouse', status: 'active' },
  ]);
  tokens.pharmacy = jwt.sign({ sub: String(IDS.pharmacyUser) }, env.jwtSecret, { expiresIn: '1h' });
  await Pharmacy.create({
    _id: IDS.pharmacy, userId: IDS.pharmacyUser, nameAr: 'صيدلية الاختبار', nameEn: 'Test Pharmacy',
    ownerName: 'O', address: 'a', city: 'Latakia', areaType: 'city', phone: '0931009001', addedBy: 'self',
  });
  await Warehouse.create({
    _id: IDS.warehouse, userId: IDS.warehouseUser, nameAr: 'مستودع التوافق', nameEn: 'Compat Warehouse',
    address: 'r', city: 'Latakia', phone: '0941009001', deliveryType: 'self', isActive: true,
    discountRate: 0, commissionRate: 0,
  });
  await Category.create({ _id: IDS.category, nameAr: 'مسكنات', nameEn: 'Painkillers', sortOrder: 1 });

  await Manufacturer.create({
    _id: IDS.manufacturer, nameAr: 'جي إس كي', nameEn: 'GSK', key: 'جي اس كي',
    logoUrl: 'https://res.cloudinary.com/feniq/image/upload/v1/manufacturers/gsk.png',
  });
  await ProductCatalog.create([
    {
      _id: IDS.catalogPanadol, nameAr: 'بنادول أكسترا', nameEn: 'Panadol Extra', manufacturerAr: 'جي إس كي',
      manufacturerEn: 'GSK', categoryId: IDS.category,
      imageUrl: 'https://res.cloudinary.com/feniq/image/upload/v1/catalog/panadol.png',
    },
    {
      _id: IDS.catalogAmoxil, nameAr: 'أموكسيل 500', nameEn: 'Amoxil 500', manufacturerAr: 'جي إس كي',
      manufacturerEn: 'GSK', categoryId: IDS.category,
    },
  ]);
  await Product.create([
    {
      _id: IDS.panadol, warehouseId: IDS.warehouse, masterProductId: IDS.catalogPanadol, categoryId: IDS.category,
      price: 1.37, unit: 'box', unitAr: 'علبة', unitEn: 'Box', bonuses: [{ buy: 10, free: 1 }],
      isActive: true, isAvailable: true,
    },
    {
      _id: IDS.amoxil, warehouseId: IDS.warehouse, masterProductId: IDS.catalogAmoxil, categoryId: IDS.category,
      price: 2.5, unit: 'strip', unitAr: 'شريط', unitEn: 'Strip', isActive: true, isAvailable: true,
    },
    {
      _id: IDS.legacy, warehouseId: IDS.warehouse, masterProductId: null, categoryId: IDS.category,
      nameAr: 'فيتامين سي قديم', nameEn: 'Vitamin C (legacy)', manufacturerAr: 'شركة قديمة', manufacturerEn: null,
      price: 0.8, unitAr: 'علبة', unitEn: 'Box', isActive: true, isAvailable: true,
    },
  ]);

  // A manufacturer discount stacked under an offer (7.5% then 5%, decimals).
  await registerManufacturers(IDS.warehouse, ['جي إس كي']);
  await createDiscount(IDS.warehouse, { manufacturerAr: 'جي إس كي', discountPercentage: 5 });
  const day = 86400000;
  await Offer.create({
    _id: IDS.offer, warehouseId: IDS.warehouse, productId: IDS.panadol, titleAr: 'عرض بنادول', titleEn: 'Panadol offer',
    discountPercentage: 7.5, startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + 30 * day),
    status: 'approved', approvedAt: new Date(),
  });
  await Advertisement.create({
    _id: IDS.advertisement, warehouseId: IDS.warehouse, titleAr: 'باقة الشتاء', titleEn: 'Winter pack',
    items: [{ productId: IDS.amoxil, quantity: 2 }], totalPriceUsd: 4.5,
    startDate: new Date(Date.now() - day), endDate: new Date(Date.now() + 30 * day),
    status: 'approved', approvedAt: new Date(), isAvailable: true,
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await stopMemoryMongo();
});

test('the catalog screens: categories, manufacturers, products (old query parameters)', async () => {
  const categories = await call('GET', '/categories');
  assert.strictEqual(categories.status, 200);
  recordOrCheck('categories', categories.body);

  const manufacturers = await call('GET', `/warehouses/${IDS.warehouse}/manufacturers`);
  assert.strictEqual(manufacturers.status, 200, JSON.stringify(manufacturers.body));
  recordOrCheck('manufacturers', manufacturers.body);

  const products = await call('GET', `/warehouses/${IDS.warehouse}/products?limit=20`);
  assert.strictEqual(products.status, 200, JSON.stringify(products.body));
  assert.strictEqual(products.body.products.length, 3);
  recordOrCheck('products', products.body);

  // The company drill-down sends the manufacturer's name exactly as the
  // manufacturers list showed it; the search box sends free text.
  const byManufacturer = await call('GET', `/warehouses/${IDS.warehouse}/products?limit=20&manufacturer=${encodeURIComponent('جي إس كي')}`);
  assert.deepStrictEqual(byManufacturer.body.products.map((p) => p.id).sort(), [String(IDS.panadol), String(IDS.amoxil)].sort());
  recordOrCheck('products_by_manufacturer', byManufacturer.body);
  const bySearch = await call('GET', `/warehouses/${IDS.warehouse}/products?limit=20&search=${encodeURIComponent('بنادول')}`);
  assert.deepStrictEqual(bySearch.body.products.map((p) => p.id), [String(IDS.panadol)]);
});

test('the offers and ads tab (no pagination parameters, as the old app sends)', async () => {
  const offers = await call('GET', '/offers/active');
  assert.strictEqual(offers.status, 200, JSON.stringify(offers.body));
  assert.strictEqual(offers.body.offers.length, 1);
  recordOrCheck('offers_active', offers.body);

  const advertisements = await call('GET', '/advertisements/active');
  assert.strictEqual(advertisements.status, 200, JSON.stringify(advertisements.body));
  assert.strictEqual(advertisements.body.advertisements.length, 1);
  recordOrCheck('advertisements_active', advertisements.body);

  const cart = await call('GET', `/advertisements/${IDS.advertisement}/cart`);
  assert.strictEqual(cart.status, 200, JSON.stringify(cart.body));
  recordOrCheck('advertisement_cart', cart.body);
});

// The old OrderRepositoryImpl.submitOrder body, built from a cart holding
// the offer product, the legacy product and one copy of the package:
// productId + quantity + displayedUnitPriceUsd (the cart's discountPriceUsd)
// per product line, advertisementId + copies per package, the idempotency key
// and the rate. No displayedBonuses, no lira price. The Flutter half checks
// the old Dart code builds exactly this from the recorded responses.
function oldOrderBody() {
  const byId = new Map(recorded.products.products.map((p) => [p.id, p]));
  return {
    warehouseId: String(IDS.warehouse),
    items: [
      { productId: String(IDS.panadol), quantity: 25, displayedUnitPriceUsd: byId.get(String(IDS.panadol)).discountPriceUsd },
      { productId: String(IDS.legacy), quantity: 3, displayedUnitPriceUsd: byId.get(String(IDS.legacy)).discountPriceUsd },
    ],
    packages: [{ advertisementId: String(IDS.advertisement), copies: 1 }],
    notes: 'old app order',
    idempotencyKey: 'old-app-compat-0001',
    rateUsed: RATE,
  };
}

test('an order in the old request shape goes through, priced as the new app would be', async () => {
  let body;
  if (RECORD) {
    body = oldOrderBody();
    fs.writeFileSync(fixturePath('order_request_old'), `${JSON.stringify(body, null, 2)}\n`);
  } else {
    body = JSON.parse(fs.readFileSync(fixturePath('order_request_old'), 'utf8'));
    // The recorded prices are still what the catalog shows now.
    assert.deepStrictEqual(body, oldOrderBody());
  }
  assert.ok(body.items.every((item) => !('displayedBonuses' in item)));

  const created = await call('POST', '/orders', body);
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  recordOrCheck('order_created', created.body);

  // The bonus the old app never showed is still granted, and never charged.
  const orderId = created.body.order.id;
  const panadolLine = await OrderItem.findOne({ orderId, productId: IDS.panadol }).lean();
  assert.strictEqual(panadolLine.freeQuantity, 3); // 25 x 1/10 = 2.5, rounded
  assert.deepStrictEqual(panadolLine.bonusApplied, { buy: 10, free: 1 });

  // A retry with the same key replays the same order.
  const replay = await call('POST', '/orders', body);
  assert.strictEqual(replay.body.order.id, orderId);

  const detail = await call('GET', `/orders/${orderId}`);
  assert.strictEqual(detail.status, 200);
  recordOrCheck('order_detail', detail.body);
  const list = await call('GET', '/orders?limit=10');
  assert.strictEqual(list.status, 200);
  recordOrCheck('orders_list', list.body);
  // Reorder is offered on a delivered order.
  await Order.updateOne({ _id: orderId }, { $set: { status: 'delivered' } });
  const reorder = await call('POST', `/orders/${orderId}/reorder`);
  assert.strictEqual(reorder.status, 200, JSON.stringify(reorder.body));
  recordOrCheck('reorder', reorder.body);
});

// 400, as on main - the status the old app already handles.
test('an old cart whose shown price is stale is refused with PRICE_CHANGED, not charged differently', async () => {
  const body = { ...oldOrderBody(), idempotencyKey: 'old-app-compat-stale-price', packages: [], notes: undefined };
  body.items = [{ productId: String(IDS.panadol), quantity: 1, displayedUnitPriceUsd: 99 }];
  const refused = await call('POST', '/orders', body);
  assert.strictEqual(refused.status, 400, JSON.stringify(refused.body));
  assert.strictEqual(refused.body.code, 'PRICE_CHANGED');
  // The fields the old app reads off the refusal are still there.
  const [problem] = refused.body.details.problems;
  assert.strictEqual(problem.productId, String(IDS.panadol));
  assert.strictEqual(problem.displayedPriceUsd, 99);
  assert.strictEqual(typeof problem.currentPriceUsd, 'number');
});
