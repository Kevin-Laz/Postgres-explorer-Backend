

class AppError extends Error {
  /**
   * @param { string } message
   * @param { number } [statusCode=500]
   * @param { code?: string, hint?: string|null, target?: any, details?: any } [opts]
   */
  constructor(message, statusCode = 500, opts = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;

    // campos opcionales para el normalizador
    this.code = opts.code || undefined;
    this.hint = opts.hint || undefined;
    this.target = opts.target || undefined;
    this.details = opts.details || undefined;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
