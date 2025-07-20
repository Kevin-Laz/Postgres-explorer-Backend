const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404);
  }
}

module.exports = NotFoundError;
