// Prints explain("executionStats") for the catalog's main queries as a
// Markdown table, for the catalog overhaul PR description (Phase 11, M6).
//
// Runs against a throwaway in-memory MongoDB it seeds itself - never a real
// database. The queries and seed live in test/helpers/catalogExplain.js,
// shared with test/catalog.explain.test.js, which fails if any of them
// regresses to a collection scan or an in-memory sort.
//
//   node scripts/explain-catalog-queries.js [productsPerWarehouse]
process.env.NODE_ENV = 'test';

const { startMemoryMongo, stopMemoryMongo } = require('../test/helpers/mongo');
const { seedCatalog, explainCatalogQueries, formatPlansTable } = require('../test/helpers/catalogExplain');

async function main() {
  const productsPerWarehouse = Number(process.argv[2]) || 4000;
  await startMemoryMongo({ dbName: 'feniq-explain-catalog' });
  try {
    const seeded = await seedCatalog({ warehouses: 3, productsPerWarehouse, catalogSize: 6000 });
    const results = await explainCatalogQueries(seeded);
    // eslint-disable-next-line no-console
    console.log(formatPlansTable(results, seeded.total));
  } finally {
    await stopMemoryMongo();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
