process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-muted-ratings';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/feniq-test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FEATURES } = require('../src/config/features');
const pharmacyReviews = require('../src/services/review.service');
const warehouseReviews = require('../src/services/warehouseReview.service');

test('mutual ratings are off by default for launch', () => {
  assert.equal(FEATURES.mutualRatings, false);
});

test('a pharmacy cannot rate a warehouse while ratings are paused', async () => {
  await assert.rejects(
    pharmacyReviews.createWarehouseReview('unused', 'unused', { orderId: 'unused', rating: 1 }),
    (err) => err.code === 'RATINGS_DISABLED',
  );
});

test('a warehouse cannot rate a pharmacy while ratings are paused', async () => {
  await assert.rejects(
    warehouseReviews.createPharmacyReview('unused', 'unused', { orderId: 'unused', rating: 1 }),
    (err) => err.code === 'RATINGS_DISABLED',
  );
});

test('paused reads reveal no historic review scores or rows', async () => {
  assert.deepEqual(await pharmacyReviews.listReviewsForPharmacy('unused'), { reviews: [], averageRating: 0 });
  assert.deepEqual(await warehouseReviews.listReviewsForWarehouse('unused'), { reviews: [], averageRating: 0 });
  const page = await warehouseReviews.listPaginatedReviewsForWarehouse('unused');
  assert.deepEqual(page.rows, []);
  assert.equal(page.averageRating, 0);
  assert.equal(page.totalCount, 0);
  assert.deepEqual(page.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
});
