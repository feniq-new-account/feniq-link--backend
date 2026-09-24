// `code` is a stable machine-readable identifier (e.g. 'PRODUCT_UNAVAILABLE')
// that the Flutter client maps to a localized string via its .arb files -
// `message` stays as the English fallback for logs and any endpoint that
// hasn't been migrated to pass a code yet (see errorHandler.js). It's
// optional and always the last argument, so existing call sites that don't
// pass one keep working unchanged.
class ApiError extends Error {
  constructor(statusCode, message, details, code) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code || null;
    this.isApiError = true;
  }

  static badRequest(message, details, code) {
    return new ApiError(400, message, details, code);
  }

  static unauthorized(message = 'Unauthorized', code) {
    return new ApiError(401, message, undefined, code);
  }

  static forbidden(message = 'Forbidden', code) {
    return new ApiError(403, message, undefined, code);
  }

  static notFound(message = 'Not found', code) {
    return new ApiError(404, message, undefined, code);
  }

  // `details` is optional and last, so every existing two-argument call site
  // is unchanged - it carries structured context for a conflict the client
  // can act on (e.g. which manufacturer a rename clashed with).
  static conflict(message, code, details) {
    return new ApiError(409, message, details, code);
  }

  static tooManyRequests(message, code) {
    return new ApiError(429, message, undefined, code);
  }
}

module.exports = { ApiError };
