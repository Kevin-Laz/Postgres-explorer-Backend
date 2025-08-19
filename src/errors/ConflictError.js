const AppError = require('./AppError');

class ConflictError extends AppError {
  /**
   * @param {string} message
   * @param {{ code?: string, hint?: string|null, target?: any, details?: any }} [opts]
   */
  constructor(message = 'Conflicto de versión', opts = {}) {
    super(message, 409, { code: 'schema_conflict', ...opts });
  }
}

module.exports = ConflictError;
