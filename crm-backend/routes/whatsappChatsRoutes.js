const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/whatsappChatController');

const uploadDir = path.join(__dirname, '../uploads/whatsapp');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `whatsapp-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/whatsapp/files/:fileId', controller.proxyFile);
router.get('/whatsapp/chats/unread/total', authMiddleware, controller.getTotalUnreadCount);
router.post('/whatsapp/personal-invite', authMiddleware, controller.createPersonalInvite);
router.get('/whatsapp/personal-status', authMiddleware, controller.getPersonalStatus);
router.get('/whatsapp/chats', authMiddleware, controller.getWhatsAppChats);
router.get('/whatsapp/chats/:id', authMiddleware, controller.getChat);
router.get('/whatsapp/chats/:id/messages', authMiddleware, controller.getMessagesByChat);
router.put('/whatsapp/chats/:id/read', authMiddleware, controller.markChatAsRead);
router.post('/whatsapp/chats/:id/send', authMiddleware, controller.sendMessage);
router.post('/whatsapp/chats/:id/send-audio', authMiddleware, upload.single('audio'), controller.sendAudio);
router.post('/whatsapp/chats/:id/send-image', authMiddleware, upload.single('image'), controller.sendImage);
router.post('/whatsapp/chats/:id/send-video', authMiddleware, upload.single('video'), controller.sendVideo);
router.post('/whatsapp/chats/:id/send-file', authMiddleware, upload.single('file'), controller.sendDocument);
router.post('/whatsapp/chats/:id/send-document', authMiddleware, upload.single('file'), controller.sendDocument);
router.post('/whatsapp/chats/:id/assign', authMiddleware, controller.assignChat);
router.post('/whatsapp/chats/:id/unassign', authMiddleware, controller.unassignChat);
router.put('/whatsapp/chats/:id/rename', authMiddleware, controller.renameChat);
router.put('/whatsapp/chats/:id/archive', authMiddleware, controller.archiveChat);
router.delete('/whatsapp/chats/:id', authMiddleware, controller.deleteChat);

module.exports = router;

