const env = require('../config/env');

function notFoundHandler(req, res, next) {
  next({ statusCode: 404, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Library errors that are the caller's fault, mapped to a 4xx with one of our
// codes (catalog overhaul Phase 11, L1) instead of a 500. The message names
// the field, never the schema, collection or raw value.
//   CastError       - a value that is not the type a path holds (a bad id)
//   ValidationError - a document that fails its schema
//   VersionError    - an optimistic-concurrency save lost the race (the
//                     services turn their own into PRODUCT_CHANGED /
//                     OFFER_CHANGED; this is the net for any other)
//   entity.parse.failed - a JSON body that does not parse
function mapLibraryError(err) {
  if (err.isApiError || err.statusCode) {
    if (err.type === 'entity.parse.failed') {
      return { statusCode: 400, message: 'The request body is not valid JSON.', code: 'INVALID_JSON' };
    }
    return null;
  }
  if (err.name === 'CastError') {
    const field = err.path || 'value';
    const code = err.kind === 'ObjectId' ? 'INVALID_ID' : 'INVALID_VALUE';
    return { statusCode: 400, message: `Invalid ${field}.`, code };
  }
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.keys(err.errors);
    return {
      statusCode: 400,
      message: `Invalid ${fields.join(', ') || 'input'}.`,
      code: 'VALIDATION_ERROR',
      details: { fields },
    };
  }
  if (err.name === 'VersionError') {
    return {
      statusCode: 409,
      message: 'This record was changed by someone else in the meantime. Reload it and try again.',
      code: 'VERSION_CONFLICT',
    };
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const mapped = mapLibraryError(err);
  if (mapped) {
    res.status(mapped.statusCode).json({
      success: false,
      message: mapped.message,
      code: mapped.code,
      details: mapped.details,
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && env.nodeEnv === 'production'
    ? 'Something went wrong. Please try again.'
    : err.message || 'Something went wrong. Please try again.';

  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only ApiError sets a meaningful `code` - guard with isApiError so an
    // unrelated `.code` property on a generic/library error (e.g. MongoDB's
    // numeric duplicate-key code) never leaks through as if it were one of
    // ours.
    code: err.isApiError ? err.code || null : null,
    details: err.details,
  });
}

module.exports = { notFoundHandler, errorHandler, mapLibraryError };
