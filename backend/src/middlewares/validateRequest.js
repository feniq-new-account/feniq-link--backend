const { ApiError } = require('../utils/ApiError');

// Request-shape checks for the catalog routes (catalog overhaul Phase 11, L1).
// Each runs after authentication in its router, so an anonymous caller still
// gets 401/403 first and learns nothing about which inputs are valid.

// Every query value must be a plain string: `?search=a&search=b` arrives as an
// array and `?search[x]=1` as an object, and either used to reach a
// `.trim()` or a regex and surface as a 500 TypeError.
function stringQueryOnly(req, res, next) {
  for (const [name, value] of Object.entries(req.query || {})) {
    if (typeof value !== 'string') {
      next(ApiError.badRequest(`Invalid ${name}.`, undefined, 'INVALID_QUERY_PARAM'));
      return;
    }
  }
  next();
}

// A 24-hex ObjectId. (mongoose's isValid also accepts any 12-character
// string, which is not an id anyone sends.)
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

// The named route params must be ObjectIds - 400 INVALID_ID up front, rather
// than a CastError deep in a query or a misleading 404.
function objectIdParams(...names) {
  return function validateObjectIdParams(req, res, next) {
    for (const name of names) {
      const value = req.params[name];
      if (value !== undefined && !isObjectId(value)) {
        next(ApiError.badRequest(`Invalid ${name}.`, undefined, 'INVALID_ID'));
        return;
      }
    }
    next();
  };
}

// router.param form, for routers that authenticate in a top-level router.use
// (their param callbacks run after it).
function objectIdParam(req, res, next, value, name) {
  if (!isObjectId(value)) {
    next(ApiError.badRequest(`Invalid ${name}.`, undefined, 'INVALID_ID'));
    return;
  }
  next();
}

module.exports = { stringQueryOnly, objectIdParams, objectIdParam, isObjectId };
