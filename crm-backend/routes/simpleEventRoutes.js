const express = require("express");
const router = express.Router();




const { 
    getSimpleEvents, 
    createSimpleEvents,
    destroySimpleEvents,
    updateSimpleEvents,
    getSimpleEventById 
} = require('../controllers/simpleEventsController');

// Получить все 
router.get('/events', getSimpleEvents);

router.get('/events/:id', getSimpleEventById);

// Создать новый 
router.post('/events', createSimpleEvents);


router.put('/events/:id', updateSimpleEvents);


router.delete('/events/:id', destroySimpleEvents);



module.exports = router;
