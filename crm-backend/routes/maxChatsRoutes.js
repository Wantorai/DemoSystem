// routes/maxChatsRoutes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/maxChatController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


// Настройка multer для загрузки аудио
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/audio');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.m4a';
    cb(null, 'voice-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Только аудио файлы разрешены'));
    }
  }
});


// Настройка multer для загрузки изображений
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB для изображений
  fileFilter: (req, file, cb) => {
    // Разрешаем только изображения
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены'));
    }
  }
});

const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/videos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, 'video-' + uniqueSuffix + ext);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Только видео файлы разрешены'));
    }
  }
});

const fileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/files');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '';
    cb(null, 'file-' + uniqueSuffix + ext);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
});




router.post('/max/personal-invite', authMiddleware, controller.createPersonalInvite);
router.get('/max/chats/:id', authMiddleware, controller.getChat);
router.get('/max/chats', authMiddleware, controller.getMaxChats);
router.get('/max/chats/:id/messages', authMiddleware, controller.getMessagesByChat);
router.post('/max/chats/start-by-phone', authMiddleware, controller.startChatByPhone);
router.post('/max/chats/:id/send', controller.sendMessageToMax);
router.post('/max/chats/:id/send-audio', upload.single('audio'), controller.sendAudioToMax);
router.post('/max/chats/:id/send-image', imageUpload.single('image'), controller.sendImageToMax);
router.post('/max/chats/:id/send-video', videoUpload.single('video'), controller.sendVideoToMax);
router.post('/max/chats/:id/send-file', fileUpload.single('file'), controller.sendFileToMax);
router.post('/max/chats/:id/send-document', fileUpload.single('file'), controller.sendFileToMax);

router.get('/max/chats/unread/total', controller.getTotalUnreadCount);
router.put('/max/chats/:chatId/read', controller.markChatAsRead);
router.put('/messages/:messageId/read', controller.markMessageAsRead);

// Взять чат в работу (присоединиться)
router.post('/max/chats/:id/assign', authMiddleware, controller.assignChat);
router.post('/max/chats/:id/invite-user', authMiddleware, controller.inviteUser);

// Освободить чат (сделать его снова свободным)
router.post('/max/chats/:id/unassign', authMiddleware, controller.unassignChat);
router.put('/max/chats/:id/rename', authMiddleware, controller.renameChat);
router.put('/max/chats/:id/archive', authMiddleware, controller.archiveChat);
router.post('/max/chats/:id/messages/:messageId/reaction', authMiddleware, controller.toggleMessageReaction);
router.delete('/max/chats/:id/messages/:messageId', authMiddleware, controller.deleteMessage);
router.delete('/max/chats/:id', authMiddleware, controller.deleteChat);

module.exports = router;


