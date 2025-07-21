const { ValidationError } = require('../errors');

function validateTableName(tableName) {
  if (
    typeof tableName !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)
  ) {
    throw new ValidationError('Nombre de tabla inválido');
  }
}

module.exports = { validateTableName };
