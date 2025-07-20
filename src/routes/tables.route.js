const express = require('express');
const router = express.Router();
const { createTable, deleteTable, getSchema } = require('../controllers/tables.controller');

router.post('/', createTable);
router.delete('/:tableName', deleteTable);
router.get('/', getSchema);

module.exports = router;