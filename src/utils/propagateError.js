const { AppError, DatabaseError } = require('../errors');

/**
 * Si el error ya viene con metadata útil (Prisma/PG con .code) debe propagarse.
 * Solo si no es AppError y tampoco tiene .code, lo envolvemos en DatabaseError.
 */
function propagateError(err, next) {
  if (err instanceof AppError) return next(err);
  if (err && err.code) return next(err);
  return next(new DatabaseError(err?.message || 'Error en la base de datos'));
}

module.exports = { propagateError };
