const { asyncHandler } = require('../utils/asyncHandler');
const catalogService = require('../services/productCatalog.service');
const viewModel = require('../viewmodels/catalogDirectory.viewmodel');

// ?after=<cursor>&limit=<1..3000>&since=<ISO date>
const directory = asyncHandler(async (req, res) => {
  const { after, limit, since } = req.query;
  const result = await catalogService.listDirectory({
    after: typeof after === 'string' && after.trim() ? after.trim() : null,
    limit: limit === undefined ? undefined : limit,
    since: typeof since === 'string' && since.trim() ? since.trim() : null,
  });
  res.json({ success: true, serverTime: new Date().toISOString(), ...viewModel.toDirectoryResponse(result) });
});

module.exports = { directory };
