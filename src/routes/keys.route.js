const express = require('express');
const router = express.Router();
const {
  listForeignKeys,
  addForeignKey,
  updateForeignKey,
  dropForeignKey
} = require('../controllers/keys.controller');

// Listar claves foráneas de una tabla
router.get('/:tableName/foreign-keys', listForeignKeys);

// Crear nueva clave foránea
router.post('/:tableName/foreign-keys/:columnName', addForeignKey);

// Actualizar clave foránea
router.put('/:tableName/foreign-keys/:columnName', updateForeignKey);

// Eliminar clave foránea
router.delete('/:tableName/foreign-keys/:columnName', dropForeignKey);

module.exports = router;
