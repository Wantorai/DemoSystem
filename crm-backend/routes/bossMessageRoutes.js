const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { getBossFolderSummaries } = require('../controllers/bossFolderSummaryController');
router.post('/app/boss/folders/summary', auth, getBossFolderSummaries);
const {
  getBossMessages,
  createBossMessage, getBossMessagesWeb, getBossMessageFolders, updateBossMessage, toggleBossMessageReaction
} = require('../controllers/bossMessageController');

// Сообщения в «boss‑чате»
router.get('/admin/boss/chats/:chatId/messages', auth, getBossMessages);

router.post('/admin/boss/chats/:chatId/messages', auth, createBossMessage);

router.get('/web/boss/chats/:chatId/messages', auth, getBossMessagesWeb);
router.get('/web/boss/chats/:chatId/folders', auth, getBossMessageFolders);

router.put('/admin/boss/chats/:chatId/messages/:messageId', auth, updateBossMessage);

router.post('/admin/boss/chats/:chatId/messages/:messageId/reaction', auth, toggleBossMessageReaction);

module.exports = router;

