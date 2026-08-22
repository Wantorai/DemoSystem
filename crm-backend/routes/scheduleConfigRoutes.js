// routes/scheduleConfigRoutes.js


const express = require('express');
const router = express.Router();

const { 
    getScheduleConfig, 
    setScheduleConfig, 
} = require('../controllers/scheduleConfigController');

// Получить все scheduleConfig
router.get('/schedule', getScheduleConfig);

// Создать новый scheduleConfig
router.post('/schedule', setScheduleConfig);





module.exports = router;


  