const express = require('express');
const router = express.Router();
const { insertData, getData } = require('../controllers/data.controller');

router.post('/:table', insertData);
router.get('/:table', getData);

module.exports = router;
