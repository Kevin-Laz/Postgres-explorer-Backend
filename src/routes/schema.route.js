const express = require('express');
const router = express.Router();
const { validateCommands, executeCommands } = require('../controllers/schema.controller');

// Validación (dry run siempre)
router.post('/commands/validate', validateCommands);

// Ejecución (apply)
router.post('/commands', executeCommands);

module.exports = router;
