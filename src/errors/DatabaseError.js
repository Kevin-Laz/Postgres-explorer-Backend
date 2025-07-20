const AppError = require('./AppError');

class DatabaseError extends AppError {
  constructor(message = 'Error en la base de datos') {
    super(message, 500);
  }
}

module.exports = DatabaseError;
