const { asyncHandler } = require('../utils/asyncHandler');
const offerService = require('../services/offer.service');
const offerViewModel = require('../viewmodels/offer.viewmodel');
const { parseCursorQuery, parseObjectIdCursor, paginationMeta } = require('../utils/pagination');

// Optional cursor pagination: `limit` (default 50, at most 100) and `cursor`
// (`after` accepted too) - the previous page's pagination.nextCursor.
function pageQuery(query) {
  const { limit, after } = parseCursorQuery({ limit: query.limit, after: query.cursor ?? query.after }, 50);
  return { limit, after: parseObjectIdCursor(after) };
}

const listActive = asyncHandler(async (req, res) => {
  const { rows, hasMore, nextCursor } = await offerService.listActiveOffers(pageQuery(req.query));
  res.json({ success: true, ...offerViewModel.toActiveOffersResponse(rows), pagination: paginationMeta(hasMore, nextCursor) });
});

module.exports = { listActive };
