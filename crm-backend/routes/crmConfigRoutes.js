const express = require('express');
const router = express.Router();
const {getAllConfigs, updateConfig, deleteCRMConfigField, createConfig} = require('../controllers/crmConfigController');

// Получить все настройки
router.get('/crm-config', getAllConfigs);

router.delete('/crm-config/:field', deleteCRMConfigField);

router.post  ('/crm-config', createConfig);
router.put   ('/crm-config', updateConfig);

module.exports = router;
