const AppError = require('./AppError');

class UnauthorizedError extends AppError {
  constructor(message = 'Acceso no autorizado') {
    super(message, 401);
  }
}

module.exports = UnauthorizedError;
