const express = require('express');
const router = express.Router();
const {getFields, listReports, getReports, createReports, updateReports, removeReports} = require('../controllers/dashboardConfigController');

router.get('/dashboard-configs/fields/:endpoint', getFields);
router.get('/dashboard-configs', listReports);
router.get('/dashboard-configs/:id', getReports);
router.post('/dashboard-configs', createReports);
router.put('/dashboard-configs/:id', updateReports);
router.delete('/dashboard-configs/:id', removeReports);


module.exports = router;