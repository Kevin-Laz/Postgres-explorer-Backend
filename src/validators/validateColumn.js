const { ValidationError } = require('../errors');
// Tipos permitidos en PostgreSQL
const ALLOWED_TYPES = [
  'INT', 'INTEGER', 'BIGINT', 'TEXT', 'VARCHAR', 'BOOLEAN',
  'DATE', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'SERIAL'
];

function validateColumn(column, index) {
  const context = `Columna #${index + 1}`;

  if (typeof column !== 'object') {
    throw new ValidationError(`${context}: debe ser un objeto`);
  }

  const { name, type, isNullable, isPrimary } = column;

  if (!name || typeof name !== 'string') {
    throw new ValidationError(`${context}: el campo "name" es obligatorio y debe ser texto`);
  }

  if (!type || typeof type !== 'string') {
    throw new ValidationError(`${context}: el campo "type" es obligatorio y debe ser texto`);
  }

  const upperType = type.toUpperCase();
  if (!ALLOWED_TYPES.includes(upperType)) {
    throw new ValidationError(`${context}: tipo "${type}" no permitido`);
  }

  if (isNullable !== undefined && typeof isNullable !== 'boolean') {
    throw new ValidationError(`${context}: "isNullable" debe ser booleano`);
  }

  if (isPrimary !== undefined && typeof isPrimary !== 'boolean') {
    throw new ValidationError(`${context}: "isPrimary" debe ser booleano`);
  }

  return {
    name,
    type: upperType,
    isNullable: !!isNullable,
    isPrimary: !!isPrimary,
  };
}

module.exports = validateColumn;