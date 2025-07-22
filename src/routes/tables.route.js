const express = require('express');
const router = express.Router();
const {
  createTable,
  deleteTable,
  getSchema,
  listTables,
  getTableDetails,
  addColumn,
  deleteColumn,
  renameColumn,
  renameTable
} = require('../controllers/tables.controller');

//Crear nueva tabla
router.post('/', createTable);

//Eliminar tabla
router.delete('/:tableName', deleteTable);

//Obtener esquema (de todas o una tabla específica)
router.get('/', getSchema);

//Listar todas las tablas
router.get('/list/all', listTables);

//Ver detalles de una tabla específica
router.get('/details/:tableName', getTableDetails);

//Agregar nueva columna
router.post('/:tableName/columns', addColumn);

//Eliminar columna específica
router.delete('/:tableName/columns/:columnName', deleteColumn);

//Renombrar columna
router.put('/:tableName/columns/:oldColumnName/rename', renameColumn);

//Renombrar tabla
router.put('/:tableName/rename', renameTable);

module.exports = router;
