#!/usr/bin/env node
// Explicit operator tool. Never imported by server.js and never a boot seed.
// All financial examples use the existing order/payment/return services.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const DAY = 86400000;
const LABEL = '[DEMO]';
const identity = {
  admin: { phone: '0944000100', name: '[DEMO] إدارة فينيق', role: 'admin' },
  owner: { phone: '0930000101', name: '[DEMO] مدير مستودع النجاح', role: 'warehouse', warehouseRole: 'owner' },
  pharmacy: { phone: '0944000102', name: '[DEMO] صيدلية الريف', role: 'pharmacy' },
  rep: { phone: '0944000103', name: '[DEMO] مندوب الريف', role: 'rep' },
  accountant: { phone: '0944000104', name: '[DEMO] محاسب النجاح', role: 'warehouse', warehouseRole: 'accountant' },
};
const password = () => `Fq!${crypto.randomBytes(18).toString('base64url')}9a`;
const generateAccounts = () => Object.fromEntries(Object.entries(identity).map(([key, value]) => [key, { ...value, password: password() }]));

async function assertPreviewTarget({ nodeEnv = process.env.NODE_ENV, confirmedDatabase = process.env.FENIQ_PREVIEW_DATABASE } = {}) {
  if (nodeEnv === 'production') throw new Error('Preview seed refuses NODE_ENV=production.');
  const name = mongoose.connection.name;
  if (!/^feniq_launch_preview(?:_[a-z0-9_]+)?$/.test(name || '') || confirmedDatabase !== name) {
    throw new Error('Use a separate feniq_launch_preview database and confirm its exact name with FENIQ_PREVIEW_DATABASE.');
  }
  // Refuse populated databases, including a previous preview. No reset, drop,
  // account takeover, password overwrite, or partial-seed retry is implicit.
  for (const collection of await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()) {
    if (await mongoose.connection.db.collection(collection.name).findOne({}, { projection: { _id: 1 } })) {
      throw new Error('Preview seed needs an empty database; existing data was left unchanged.');
    }
  }
  const external = ['FIREBASE_SERVICE_ACCOUNT_PATH', 'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'TELEGRAM_BOT_TOKEN', 'SMS_PROVIDER_API_KEY'];
  if (external.some((key) => process.env[key])) throw new Error('Disable external notification credentials in the isolated preview environment first.');
}

async function seedLaunchPreview(accounts, options) {
  // Validate all credentials before the first database write.
  for (const [key, expected] of Object.entries(identity)) {
    const account = accounts?.[key];
    if (account?.phone !== expected.phone || account.role !== expected.role || typeof account.password !== 'string' || account.password.length < 16) {
      throw new Error('Missing or invalid private preview credentials.');
    }
  }
  await assertPreviewTarget(options);
  const marker = mongoose.connection.db.collection('launch_preview_seed');
  await marker.insertOne({ _id: 'launch-preview-v1', status: 'building', startedAt: new Date() });
  const model = (name) => require(`../src/models/${name}.model`);
  const User = model('user'), Warehouse = model('warehouse'), Pharmacy = model('pharmacy');
  const Product = model('product'), Order = model('order'), Item = model('orderItem');
  const Rep = model('rep'), Visit = model('repVisit'), Account = model('ledgerAccount');
  // Materialize every model/index before transaction-based fixture writes.
  for (const file of await fs.readdir(path.join(__dirname, '../src/models'))) {
    if (file.endsWith('.model.js')) require(path.join(__dirname, '../src/models', file));
  }
  await Promise.all(Object.values(mongoose.models).map((value) => value.init()));
  // This is an explicitly confirmed, empty, isolated sales demo, never production.
  await require('../src/models/platformSetting.model').create({ key: 'pharmacistLaunch',
    value: { mode: 'ordering_open', message: '[DEMO] Isolated preview ordering', revision: 1 } });

  const seed = require('../src/services/demoSeed.service');
  await seed.seedDemoDataIfEmpty();
  const warehouses = await Warehouse.find().sort({ phone: 1 });
  const warehouse = warehouses.find((row) => row.phone === accounts.owner.phone);
  const users = {};
  for (const row of warehouses) {
    const primary = String(row.id) === String(warehouse.id);
    await User.updateOne({ _id: row.userId }, { $set: {
      name: primary ? accounts.owner.name : `${LABEL} ${row.nameEn}`,
      password: await bcrypt.hash(primary ? accounts.owner.password : password(), 10),
      warehouseRole: primary ? 'owner' : 'accountant',
    } });
    row.nameAr = `${LABEL} ${row.nameAr}`;
    row.nameEn = `${LABEL} ${row.nameEn}`;
    row.address = 'عنوان تجريبي — ليس عنواناً لصيدلية أو مستودع حقيقي';
    row.loyalty = { enabled: true, mode: primary ? 'monthly' : 'per_order', revision: 1,
      tiers: [{ minSyp: 10000, discountSyp: 100 }, { minSyp: 100000, discountSyp: 1500 }, { minSyp: 300000, discountSyp: 5000 }] };
    await row.save();
  }
  users.owner = await User.findById(warehouse.userId);
  for (const key of ['admin', 'accountant', 'pharmacy']) {
    users[key] = await User.create({ ...identity[key], password: await bcrypt.hash(accounts[key].password, 10), status: 'active' });
  }
  warehouse.memberUserIds = [users.accountant.id];
  await warehouse.save();
  const pharmacies = [];
  for (let index = 0; index < 3; index++) {
    const user = index === 0 ? users.pharmacy : await User.create({ name: `${LABEL} صيدلي ${index + 1}`,
      phone: `094400010${index + 4}`, password: await bcrypt.hash(password(), 10), role: 'pharmacy', status: 'active' });
    pharmacies.push(await Pharmacy.create({ userId: user.id, nameAr: `${LABEL} ${['صيدلية الريف', 'صيدلية المدينة', 'صيدلية جبلة'][index]}`,
      nameEn: `${LABEL} Pharmacy ${index + 1}`, ownerName: user.name, phone: user.phone,
      address: 'عنوان افتراضي للعرض فقط', city: index === 2 ? 'Jableh' : 'Latakia', areaType: index === 1 ? 'city' : 'rural', addedBy: 'admin',
      // Deliberately pending: a sample coordinate is never treated as a real
      // pharmacy approval. To try a new verified scan, approve the real test
      // premises in the admin screen and physically scan there.
      location: { type: 'Point', coordinates: [35.78 + index * 0.01, 35.55] }, locationApproval: 'pending' }));
  }
  const repService = require('../src/services/rep.service');
  const temporary = password();
  const rep = await repService.createRep(warehouse.id, { ...identity.rep, password: temporary, commissionRate: 4, warehouseShareToRep: false });
  await require('../src/services/auth.service').changePassword(rep.userId, { currentPassword: temporary, newPassword: accounts.rep.password });
  users.rep = await User.findById(rep.userId);
  for (const pharmacy of pharmacies) await repService.assignPharmacy(warehouse.id, users.accountant.id, pharmacy.id, rep.id);
  const subscription = require('../src/services/warehouseSubscription.service');
  for (const row of warehouses) await subscription.configureSubscription(row.id, users.admin.id, { status: 'trial', plan: 'field_team', note: 'بيانات عرض وهمية — ليست حركة عمل حقيقية' });
  // Freeze a manual example rate. Never fetch a market rate or claim this is
  // today's Syrian exchange rate.
  await model('exchangeRate').create({ _id: 'singleton', usdToSyp: 1000, source: 'manual', manualOverride: true });
  const Catalog = model('productCatalog');
  // Reuse the checked-in matching pictures by URL; never upload to a real
  // Cloudinary account or make an outbound request while building fixtures.
  for (const product of await Product.find({ masterProductId: null })) {
    let master = await Catalog.findOne({ nameAr: product.nameAr, manufacturerAr: product.manufacturerAr });
    if (!master) master = await Catalog.create({ nameAr: product.nameAr, nameEn: product.nameEn,
      manufacturerAr: product.manufacturerAr, manufacturerEn: product.manufacturerEn, categoryId: product.categoryId });
    product.masterProductId = master.id;
    await product.save();
  }
  for (const [index, row] of require('../../site/demo-catalog.json').slice(0, 24).entries()) {
    await fs.access(path.join(__dirname, '../../site', row.image));
    const master = await Catalog.create({ nameAr: row.n, nameEn: row.n, manufacturerAr: row.m,
      strength: row.s, dosageForm: row.f, activeIngredient: row.c,
      imageUrl: `https://feniq-site.onrender.com/${row.image}`, imageMatch: 'exact' });
    for (const rowWarehouse of warehouses) await Product.create({ warehouseId: rowWarehouse.id, masterProductId: master.id,
      unit: 'box', price: 1 + index * 0.25, isAvailable: true, expiryDate: new Date(Date.now() + 365 * DAY) });
  }
  await seed.seedDemoBonuses();
  const delivery = require('../src/services/deliverySchedule.service');
  await delivery.configure(warehouse.id, users.accountant.id, { enabled: true, revision: 0,
    zones: ['الريف الشمالي — تجريبي', 'جبلة — تجريبي'].map((name) => ({ name, active: true, preparationHours: 2, exceptions: [],
      slots: [1, 4, 6].map((weekday) => ({ weekday, departureTime: '08:00', arrivalHours: 5, cutoffHours: 8 })) })) });
  const settings = await delivery.settings(warehouse.id);
  for (let index = 0; index < pharmacies.length; index++) await delivery.assign(warehouse.id, users.accountant.id, pharmacies[index].id, { zoneId: String(settings.zones[index === 2 ? 1 : 0]._id), revision: 0 });
  const orders = require('../src/services/order.service'), warehouseOrders = require('../src/services/warehouseOrder.service');
  const delivered = [];
  for (const [index, pharmacy] of pharmacies.entries()) {
    const products = await Product.find({ warehouseId: warehouse.id, isAvailable: true }).sort({ _id: 1 }).limit(6);
    for (let stage = 0; stage < 6; stage++) {
      const order = await orders.createOrder({ userId: pharmacy.userId, pharmacyId: pharmacy.id, warehouseId: warehouse.id,
        rateUsed: 1000, idempotencyKey: `launch-preview-${index}-${stage}`,
        items: products.slice(0, 3).map((product, number) => ({ productId: product.id, quantity: 10 + stage * 5 + number })), notes: `${LABEL} طلب عرض ${index + 1}/${stage + 1}` });
      const id = String(order._id || order.id);
      for (let advance = 0; advance < Math.min(stage, 3); advance++) await warehouseOrders.advanceOrderStatus(id, warehouse.id, users.accountant.id);
      if (stage >= 3) delivered.push({ orderId: id, pharmacy });
    }
  }
  // Two real return workflows: one awaiting approval and one partial credit.
  for (let index = 0; index < 2; index++) {
    const example = delivered[index], item = await Item.findOne({ orderId: example.orderId });
    const { returnRequest } = await require('../src/services/return.service').createReturn({ pharmacyId: example.pharmacy.id, orderId: example.orderId,
      items: [{ orderItemId: item.id, quantity: 1, reasonType: 'damaged' }], notes: `${LABEL} مرتجع للعرض`, images: [] });
    if (index === 1) await require('../src/services/warehouseReturn.service').approveReturn(returnRequest.id, warehouse.id, users.accountant.id);
  }
  for (const pharmacy of pharmacies) {
    const account = await Account.findOne({ warehouseId: warehouse.id, pharmacyId: pharmacy.id });
    const amount = Math.floor((account?.balanceCache?.syp || 0) / 3);
    if (amount > 0) await require('../src/services/payment.service').createPayment(warehouse.id, users.accountant.id, {
      pharmacyId: pharmacy.id, amount, currency: 'SYP', method: 'cash', note: `${LABEL} قبض جزئي تجريبي`, idempotencyKey: `launch-preview-cash-${pharmacy.id}` });
  }
  await require('../src/services/complaint.service').createComplaint({ pharmacyId: pharmacies[0].id, pharmacyUserId: users.pharmacy.id,
    warehouseId: warehouse.id, subject: `${LABEL} استفسار عن التوزيع`, description: 'شكوى وهمية لتجربة متابعة الإدارة والرد عليها.' });
  await require('../src/services/review.service').createWarehouseReview(pharmacies[0].id, users.pharmacy.id, {
    orderId: delivered[0].orderId, rating: 5, comment: 'تقييم تجريبي فقط' });
  await model('offer').create({ warehouseId: warehouse.id, productId: (await Product.findOne({ warehouseId: warehouse.id })).id,
    titleAr: `${LABEL} عرض بانتظار الإدارة`, titleEn: '[DEMO] Pending offer', discountPercentage: 5,
    startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + 30 * DAY), status: 'pending' });
  await User.create({ name: `${LABEL} طلب تسجيل للمراجعة`, phone: '0944000199', password: await bcrypt.hash(password(), 10), role: 'pharmacy', status: 'pending' }).then(async (user) => {
    await Pharmacy.create({ userId: user.id, nameAr: `${LABEL} صيدلية بانتظار الموافقة`, nameEn: '[DEMO] Pending pharmacy', ownerName: user.name,
      address: 'عنوان وهمي', city: 'Latakia', areaType: 'rural', phone: user.phone, addedBy: 'self' });
  });
  // Clearly synthetic history in a disposable database, not a bypass of the
  // real QR/GPS endpoint. No approved real pharmacy location is invented.
  await Visit.create(['verified', 'out_of_range', 'location_unapproved'].map((status, index) => ({ repId: rep.id, warehouseId: warehouse.id,
    pharmacyId: pharmacies[index].id, status, scannedAt: new Date(Date.now() - (index + 1) * 3600000),
    accuracyMeters: 25, distanceMeters: index === 1 ? 700 : 15, verificationPolicy: { radiusMeters: 150, maxAccuracyMeters: 100, maxAgeSeconds: 120 } })));
  const ledger = require('../src/services/ledger.service');
  const accountsInLedger = await Account.find();
  for (const account of accountsInLedger) {
    if (!(await ledger.verifyAccount(account.id)).ok) throw new Error('Preview financial verification failed.');
  }
  const summary = { schemaVersion: 1, label: LABEL, database: mongoose.connection.name, completedAt: new Date().toISOString(),
    warehouseId: warehouse.id, users: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, role: user.role, warehouseRole: user.warehouseRole }])),
    counts: { warehouses: warehouses.length, pharmacies: await Pharmacy.countDocuments(), products: await Product.countDocuments(),
      orders: await Order.countDocuments(), payments: await model('payment').countDocuments(), returns: await model('return').countDocuments(),
      visits: await Visit.countDocuments(), reps: await Rep.countDocuments(), ledgerAccountsVerified: accountsInLedger.length },
    limitations: ['Isolated preview only; not inserted into Render production.', 'Example rate 1000 is fictional.',
      'Visit history is synthetic; new scans still require approved real coordinates and QR/GPS.', 'No historical cash dates were fabricated; overdue buckets may be empty.'] };
  await marker.updateOne({ _id: 'launch-preview-v1' }, { $set: { status: 'complete', summary } });
  return summary;
}

async function main() {
  require('dotenv').config();
  const outputIndex = process.argv.indexOf('--credentials-output');
  if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error('Pass --credentials-output with a private JSON path outside the repository.');
  const output = path.resolve(process.argv[outputIndex + 1]);
  const repository = path.resolve(__dirname, '../..');
  const relative = path.relative(repository, output);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Credentials must be stored outside the repository.');
  if (!process.env.MONGODB_URI) throw new Error('Configure the isolated preview MONGODB_URI in the environment.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await assertPreviewTarget();
  const accounts = generateAccounts();
  await fs.writeFile(output, JSON.stringify({ environment: 'isolated-preview', status: 'prepared', accounts }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const summary = await seedLaunchPreview(accounts);
  await fs.writeFile(output, JSON.stringify({ environment: 'isolated-preview', status: 'complete', accounts, summary }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: 'complete', credentialsFile: output, summary }, null, 2));
}

if (require.main === module) main().catch(() => {
  console.error('Preview setup did not complete. No credentials or database connection strings were printed. Check that the target is a new isolated preview database, notifications are disabled, and the output path is unused.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());

module.exports = { assertPreviewTarget, generateAccounts, seedLaunchPreview };
