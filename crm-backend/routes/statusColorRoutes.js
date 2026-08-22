// routes/statusColorRoutes.js


const express = require('express');
const router = express.Router();

const { 
    getColors, 
    setColor, 
} = require('../controllers/statusColorController');

// Получить все colors
router.get('/status-colors', getColors);

// Создать новый color
router.post('/status-colors', setColor);





module.exports = router;


  