// routes/configLinksRoutes.js


const express = require('express');
const router = express.Router();
const { getConfigLinks, createConfigLinks, updateConfigLinks, getConfigLinksByID } = require('../controllers/configLinksController');


//
router.get('/config-links', getConfigLinks);

router.get('/config-links/:id/', getConfigLinksByID);

// 
router.post('/config-links', createConfigLinks);

// 
router.put('/config-links/:id/', updateConfigLinks);

// 
// router.delete('/config-links/:id/', destroyConfigLinks);


module.exports = router;