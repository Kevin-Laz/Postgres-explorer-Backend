const express = require('express');
const router = express.Router();
const validateQuery = require('../middlewares/validateQuery');
const { executeQuery } = require('../controllers/query.controller');

router.post('/', validateQuery, executeQuery);

module.exports = router;
