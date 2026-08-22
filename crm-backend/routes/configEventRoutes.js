// routes/configEventRoutes.js


const express = require('express');
const router = express.Router();
const { getConfigEvent, createConfigEvent, saveConfigEvent} = require('../controllers/configEventController');


//
router.get('/event-config', getConfigEvent);

router.put('/event-config', saveConfigEvent)
// 
router.post('/event-config', createConfigEvent);



module.exports = router;