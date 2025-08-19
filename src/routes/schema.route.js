const express = require('express');
const router = express.Router();
const { validateCommands, executeCommands, getSnapshot } = require('../controllers/schema.controller');

// Validación (dry run siempre)
router.post('/commands/validate', validateCommands);

// Ejecutar comandos (all-or-nothing o bestEffort)
router.post('/commands/execute', executeCommands);

// Snapshot de esquema (opcionalmente por tabla)
router.post('/snapshot', getSnapshot);

module.exports = router;
