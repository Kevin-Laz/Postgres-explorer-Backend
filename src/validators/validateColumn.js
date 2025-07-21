const { ValidationError } = require('../errors');
// Tipos permitidos en PostgreSQL
const ALLOWED_TYPES = [
  'INT', 'INTEGER', 'BIGINT', 'TEXT', 'VARCHAR', 'BOOLEAN',
  'DATE', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'SERIAL'
];

const SIMPLE_TYPES = ['INT', 'INTEGER', 'BIGINT', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'SERIAL'];
const PARAM_TYPES = ['VARCHAR', 'CHAR', 'DECIMAL', 'NUMERIC', 'FLOAT'];


function validateColumn(column, index) {
  const context = `Columna #${index + 1}`;

  if (typeof column !== 'object') {
    throw new ValidationError(`${context}: debe ser un objeto`);
  }

  const { name, type, isNullable, isPrimary } = column;

  const baseType = type.toUpperCase().split('(')[0];
  const isValidSimple = SIMPLE_TYPES.includes(baseType);
  const isValidParam = PARAM_TYPES.includes(baseType) && /^\w+\(\d+(,\d+)?\)$/.test(type.toUpperCase());

  if (!isValidSimple && !isValidParam) {
    throw new ValidationError(`${context}: tipo "${type}" no permitido o mal definido`);
  }

  if (!name || typeof name !== 'string') {
    throw new ValidationError(`${context}: el campo "name" es obligatorio y debe ser texto`);
  }

  if (!type || typeof type !== 'string') {
    throw new ValidationError(`${context}: el campo "type" es obligatorio y debe ser texto`);
  }

  if (isNullable !== undefined && typeof isNullable !== 'boolean') {
    throw new ValidationError(`${context}: "isNullable" debe ser booleano`);
  }

  if (isPrimary !== undefined && typeof isPrimary !== 'boolean') {
    throw new ValidationError(`${context}: "isPrimary" debe ser booleano`);
  }

  if (isPrimary === true && isNullable === true) {
    throw new ValidationError(`${context}: Una clave primaria no puede ser NULL`);
  }

  return {
    name,
    type: type.toUpperCase(),
    isNullable: !!isNullable,
    isPrimary: !!isPrimary,
  };
}

module.exports = validateColumn;