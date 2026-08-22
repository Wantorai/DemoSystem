// routes/bossPinnedRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/authMiddleware');
const {
    listBossPinned, pinBossMess, unpinBossMess, positionBossMessage
} = require('../controllers/bossPinnedController');

// GET /boss_chats/:chatId/pinned
router.get('/boss_chats/:chatId/pinned', auth, listBossPinned);

// POST /boss_chats/:chatId/pin
router.post('/boss_chats/:chatId/pin', auth, pinBossMess);

// POST /boss_chats/:chatId/unpin
router.post('/boss_chats/:chatId/unpin', auth, unpinBossMess);

// endpoint, который возвращает позицию/страницу сообщения
router.get('/boss_chats/:chatId/messages/:messageId/position', positionBossMessage);

module.exports = router;
