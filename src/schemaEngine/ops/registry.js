const renameTable = require('./renameTable');
const addColumn = require('./addColumn');
const renameColumn = require('./renameColumn');
const dropColumn = require('./dropColumn');
const changeColumnType = require('./changeColumnType');


const createTable = require('./createTable');
const addForeignKey = require('./addForeignKey');
const dropForeignKey = require('./dropForeignKey');
const updateForeignKey = require('./updateForeignKey');

const REGISTRY = {
  'RENAME_TABLE': renameTable,
  'ADD_COLUMN': addColumn,
  'RENAME_COLUMN': renameColumn,
  'DROP_COLUMN': dropColumn,
  'CHANGE_COLUMN_TYPE': changeColumnType,

  'CREATE_TABLE': createTable,
  'ADD_FOREIGN_KEY': addForeignKey,
  'DROP_FOREIGN_KEY': dropForeignKey,
  'UPDATE_FOREIGN_KEY': updateForeignKey,
};

function resolveOp(op) {
  return REGISTRY[op];
}

module.exports = { resolveOp };
