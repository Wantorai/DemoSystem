// routes/callRoutes.js
const express = require('express');
const router = express.Router();

const { getCallsByPhoneCRM, getRecordMpegCRM } = require('../controllers/tele2Controller');
router.get('/calls/by-phone', getCallsByPhoneCRM);
router.get('/calls/record/:filename', getRecordMpegCRM);


module.exports = router;

