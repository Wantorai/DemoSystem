const express = require('express');
const router = express.Router();
const {getAllStatusesCRM, createStatusesCRM, updateStatusesCRM, removeStatusesCRM} = require('../controllers/statusCRMController');

router.get('/crm-statuses', getAllStatusesCRM);
router.post('/crm-statuses', createStatusesCRM);
router.put('/crm-statuses/:id', updateStatusesCRM);
router.delete('/crm-statuses/:id', removeStatusesCRM); 

module.exports = router;
