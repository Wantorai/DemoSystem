const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { login, logout, me, loginMobApp, checkStatus, uploadAvatar, deleteAvatar } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../models');
const User = db.sequelize.models.User;

const router = express.Router();
const avatarDir = path.join(process.cwd(), 'uploads', 'avatars');
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(avatarDir, { recursive: true });
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${req.user.id}-${Date.now()}${safeExt}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      return cb(new Error('ONLY_IMAGES_ALLOWED'));
    }
    cb(null, true);
  },
});

router.post('/login', login);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, me);
router.post('/me/avatar', authMiddleware, avatarUpload.single('avatar'), uploadAvatar);
router.delete('/me/avatar', authMiddleware, deleteAvatar);

router.get('/users', authMiddleware, async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});

router.post('/loginMobApp', loginMobApp); // для мобильного приложения
router.get('/check-status', authMiddleware, checkStatus); // для мобильного приложения

module.exports = router;
