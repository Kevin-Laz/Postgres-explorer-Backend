const express = require('express');
const router = express.Router();
const {
  insertData,
  getData,
  updateData,
  deleteData
} = require('../controllers/data.controller');

// Crear nuevo registro
router.post('/:table', insertData);

// Obtener todos los registros
router.get('/:table', getData);

// Actualizar un registro
router.put('/:table/:id', updateData);

// Eliminar un registro
router.delete('/:table/:id', deleteData);

module.exports = router;