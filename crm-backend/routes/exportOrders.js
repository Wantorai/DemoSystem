// routes/exportOrders.js

const express = require('express');
const router = express.Router();
const exportOrders = require('../controllers/exportOrders');

router.post('/export', exportOrders);

module.exports = router;
