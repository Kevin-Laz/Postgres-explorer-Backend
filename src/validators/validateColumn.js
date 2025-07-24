const { ValidationError } = require('../errors');
// Tipos permitidos en PostgreSQL
const ALLOWED_TYPES = [
  'INT', 'INTEGER', 'BIGINT', 'TEXT', 'VARCHAR', 'BOOLEAN',
  'DATE', 'TIMESTAMP', 'DECIMAL', 'FLOAT', 'SERIAL', 'UUID'
];

const SIMPLE_TYPES = ['INT', 'INTEGER', 'BIGINT', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'SERIAL', 'UUID'];
const PARAM_TYPES = ['VARCHAR', 'CHAR', 'DECIMAL', 'NUMERIC', 'FLOAT'];

const ALLOWED_FUNCTIONS = {
      'UUID': ['gen_random_uuid()'],
      'TIMESTAMP': ['now()'],
      'DATE': ['now()']
    };


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

  if ('default' in column) {
    const value = column.default;

    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new ValidationError(`${context}: "default" debe ser texto o numérico`);
    }

    const typeUpper = column.type.toUpperCase().split('(')[0];

    if (typeof value === 'string') {
      const isAllowedFunction = ALLOWED_FUNCTIONS[typeUpper] && ALLOWED_FUNCTIONS[typeUpper].includes(value.toLowerCase());

      // Si no es una función permitida, debe ser un string plano (valor, no expresión SQL)
      if (!isAllowedFunction) {
        // Evitar expresiones en formato de funcion
        if (/\w+\(.*\)/.test(value)) {
          throw new ValidationError(`${context}: la función "${value}" no está permitida como valor por defecto para el tipo ${typeUpper}`);
        }
      }
    }
  }

  if ('check' in column && typeof column.check !== 'string') {
    throw new ValidationError(`${context}: "check" debe ser una expresión SQL en texto`);
  }
  if ('unique' in column && typeof column.unique !== 'boolean') {
    throw new ValidationError(`${context}: "unique" debe ser booleano`);
  }


  return {
    name,
    type: type.toUpperCase(),
    isNullable: !!isNullable,
    isPrimary: !!isPrimary,
    default: column.default,
    check: column.check,
    unique: !!column.unique
  };
}

module.exports = validateColumn;