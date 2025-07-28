const express = require('express');
const router = express.Router();
const { checkConnection } = require('../controllers/connection.controller');

router.post('/check-connection', checkConnection);
module.exports = router;