const AppError = require('./AppError');

class BadRequestError extends AppError {
  constructor(message = 'Solicitud incorrecta') {
    super(message, 400);
  }
}

module.exports = BadRequestError;
