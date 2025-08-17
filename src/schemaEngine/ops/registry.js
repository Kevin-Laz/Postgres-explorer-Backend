const renameTable = require('./renameTable');
const addColumn = require('./addColumn');
const renameColumn = require('./renameColumn');
const dropColumn = require('./dropColumn');
const changeColumnType = require('./changeColumnType');

const REGISTRY = {
  'RENAME_TABLE': renameTable,
  'ADD_COLUMN': addColumn,
  'RENAME_COLUMN': renameColumn,
  'DROP_COLUMN': dropColumn,
  'CHANGE_COLUMN_TYPE': changeColumnType,
};

function resolveOp(op) {
  return REGISTRY[op];
}

module.exports = { resolveOp };
