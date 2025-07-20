const AppError = require('./AppError');

class ValidationError extends AppError {
  constructor(message = 'Error de validación') {
    super(message, 400);
  }
}

module.exports = ValidationError;
