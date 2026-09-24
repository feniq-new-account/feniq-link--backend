const { asyncHandler } = require('../utils/asyncHandler');
const advertisementService = require('../services/advertisement.service');
const advertisementViewModel = require('../viewmodels/advertisement.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

// Optional cursor pagination: `limit` (default 50, at most 100) and `cursor`
// (`after` accepted too) - the previous page's pagination.nextCursor.
function pageQuery(query) {
  const { limit, after } = parseCursorQuery({ limit: query.limit, after: query.cursor ?? query.after }, 50);
  return { limit, after: parseObjectIdCursor(after) };
}

const listActive = asyncHandler(async (req, res) => {
  const { rows, hasMore, nextCursor } = await advertisementService.listActiveAdvertisements(pageQuery(req.query));
  res.json({ success: true, ...advertisementViewModel.toActiveAdvertisementsResponse(rows), pagination: paginationMeta(hasMore, nextCursor) });
});

// Builds a cart payload from an advertisement. Creates NOTHING - no order, no
// document, same as the reorder endpoint it is shaped after. Every price in
// the response is read from the database; createOrder re-reads all of them
// again at checkout and never trusts what comes back from the client.
const cart = asyncHandler(async (req, res) => {
  const preparation = await advertisementService.prepareAdvertisementCart(req.params.id);
  res.json({ success: true, ...advertisementViewModel.toAdvertisementCartResponse(preparation) });
});

module.exports = { listActive, cart };
