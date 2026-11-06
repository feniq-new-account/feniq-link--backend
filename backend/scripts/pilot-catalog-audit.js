'use strict';
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const Warehouse = require('../src/models/warehouse.model');
const Product = require('../src/models/product.model');
const Offer = require('../src/models/offer.model');

async function main() {
  await connectDB();
  const warehouses = await Warehouse.find({}).select('_id nameAr isActive').lean();
  const rows = [];
  for (const warehouse of warehouses) {
    const [products, offers] = await Promise.all([
      Product.countDocuments({ warehouseId: warehouse._id }),
      Offer.countDocuments({ warehouseId: warehouse._id })
    ]);
    rows.push({ name: warehouse.nameAr, active: warehouse.isActive, products, offers });
  }
  process.stdout.write(JSON.stringify({ warehouseCount: rows.length, warehouses: rows }, null, 2) + '\n');
}
main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
}).finally(async () => mongoose.disconnect());
