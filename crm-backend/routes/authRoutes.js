const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { login, logout, me, loginMobApp, checkStatus, uploadAvatar, deleteAvatar } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../models');
const User = db.sequelize.models.User;
const { recordSecurityEventSafe } = require('../services/securityEventService');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    recordSecurityEventSafe({
      req,
      eventType: 'login_rate_limited',
      severity: 'critical',
      statusCode: 429,
      username: req.body?.username || req.body?.phone,
      details: { windowMinutes: 15, limit: 10 },
      throttleKey: `login-limit:${req.ip}`,
      throttleMs: 60 * 1000,
    });
    return res.status(429).json({ error: 'Слишком много попыток входа. Повторите через 15 минут' });
  },
});

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

router.post('/login', loginLimiter, login);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, me);
router.post('/me/avatar', authMiddleware, avatarUpload.single('avatar'), uploadAvatar);
router.delete('/me/avatar', authMiddleware, deleteAvatar);

router.get('/users', authMiddleware, async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});

router.post('/loginMobApp', loginLimiter, loginMobApp); // для мобильного приложения
router.get('/check-status', authMiddleware, checkStatus); // для мобильного приложения

module.exports = router;
