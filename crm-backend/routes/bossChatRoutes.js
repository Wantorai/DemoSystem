const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  createBossChat,
  listBossChatsForAdmin,
  listBossChatsForApp,
  getBossChat,
  updateBossChat,
  deleteBossChat,
  getBossChatUsers,
  listBossChatsForWeb
} = require('../controllers/bossChatController');

// CRUD для самих «boss‑чатов»
router.post('/admin/boss/chats',       auth, createBossChat);
router.get('/admin/boss/chats',        auth, listBossChatsForAdmin);
router.get('/app/boss/chats',        auth, listBossChatsForApp);
router.get('/web/boss/chats', auth, listBossChatsForWeb);
router.get('/admin/boss/chats/:id',    auth, getBossChat);
router.put('/admin/boss/chats/:id',    auth, updateBossChat);
router.delete('/admin/boss/chats/:id', auth, deleteBossChat);
router.get('/admin/boss/chats/:id/users', getBossChatUsers)

module.exports = router;
