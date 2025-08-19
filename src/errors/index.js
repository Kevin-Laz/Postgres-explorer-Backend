const AppError = require('./AppError');
const ValidationError = require('./ValidationError');
const DatabaseError = require('./DatabaseError');
const NotFoundError = require('./NotFoundError');
const UnauthorizedError = require('./UnauthorizedError');
const BadRequestError = require('./BadRequestError');
const ConflictError = require('./ConflictError');

module.exports = {
  AppError,
  ValidationError,
  DatabaseError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ConflictError,
};
