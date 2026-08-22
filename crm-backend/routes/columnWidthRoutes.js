// routes/columnWidth.js


const express = require('express');
const router = express.Router();
const { getColumnWidths, updateColumnWidth } = require('../controllers/columnWidthController');

router.get('/column-width', getColumnWidths);
router.post('/column-width', updateColumnWidth);


module.exports = router;