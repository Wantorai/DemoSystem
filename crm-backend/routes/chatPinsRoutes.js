const express = require('express');
const auth = require('../middleware/authMiddleware');
const { getChatPins, setChatPins } = require('../controllers/chatPinsController');

const router = express.Router();

router.get('/chat-pins', auth, getChatPins);
router.put('/chat-pins', auth, setChatPins);

module.exports = router;
