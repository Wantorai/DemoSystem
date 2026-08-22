const express = require('express');
const auth = require('../middleware/authMiddleware');
const { getAppStyle, updateAppStyle } = require('../controllers/appStyleController');

const router = express.Router();

router.get('/app-style', getAppStyle);
router.put('/admin/app-style', auth, updateAppStyle);

module.exports = router;
