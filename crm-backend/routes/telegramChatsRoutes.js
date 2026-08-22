const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/telegramChatController');

const uploadDir = path.join(__dirname, '../uploads/telegram');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `telegram-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/telegram/files/:fileId', controller.proxyFile);
router.get('/telegram/chats/unread/total', authMiddleware, controller.getTotalUnreadCount);
router.post('/telegram/personal-invite', authMiddleware, controller.createPersonalInvite);
router.get('/telegram/personal-status', authMiddleware, controller.getPersonalStatus);
router.get('/telegram/chats', authMiddleware, controller.getTelegramChats);
router.get('/telegram/chats/:id', authMiddleware, controller.getChat);
router.get('/telegram/chats/:id/messages', authMiddleware, controller.getMessagesByChat);
router.put('/telegram/chats/:id/read', authMiddleware, controller.markChatAsRead);
router.post('/telegram/chats/:id/send', authMiddleware, controller.sendMessage);
router.post('/telegram/chats/:id/send-audio', authMiddleware, upload.single('audio'), controller.sendAudio);
router.post('/telegram/chats/:id/send-image', authMiddleware, upload.single('image'), controller.sendImage);
router.post('/telegram/chats/:id/send-video', authMiddleware, upload.single('video'), controller.sendVideo);
router.post('/telegram/chats/:id/send-file', authMiddleware, upload.single('file'), controller.sendDocument);
router.post('/telegram/chats/:id/send-document', authMiddleware, upload.single('file'), controller.sendDocument);
router.post('/telegram/chats/:id/assign', authMiddleware, controller.assignChat);
router.post('/telegram/chats/:id/invite-user', authMiddleware, controller.inviteUser);
router.post('/telegram/chats/:id/unassign', authMiddleware, controller.unassignChat);
router.put('/telegram/chats/:id/rename', authMiddleware, controller.renameChat);
router.put('/telegram/chats/:id/archive', authMiddleware, controller.archiveChat);
router.post('/telegram/chats/:id/messages/:messageId/reaction', authMiddleware, controller.toggleMessageReaction);
router.delete('/telegram/chats/:id/messages/:messageId', authMiddleware, controller.deleteMessage);
router.delete('/telegram/chats/:id', authMiddleware, controller.deleteChat);

module.exports = router;

