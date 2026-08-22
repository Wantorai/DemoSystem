const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/authMiddleware');
const supportAuth = require('../middleware/supportAuthMiddleware');
const {
  createTicket,
  listMyTickets,
  listAdminTickets,
  getUnreadTicketCount,
  markTicketsViewed,
  updateTicket,
  deleteTicket,
} = require('../controllers/supportTicketController');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads', 'support');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').slice(0, 12);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    cb(allowed ? null : new Error('Можно прикрепить только изображение или видео'), allowed);
  },
});

router.get('/support/tickets/my', supportAuth, listMyTickets);
router.post('/support/tickets', supportAuth, upload.single('attachment'), createTicket);
router.get('/admin/support/tickets/unread-count', auth, getUnreadTicketCount);
router.post('/admin/support/tickets/mark-viewed', auth, markTicketsViewed);
router.get('/admin/support/tickets', auth, listAdminTickets);
router.patch('/admin/support/tickets/:id', auth, updateTicket);
router.delete('/admin/support/tickets/:id', auth, deleteTicket);

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Файл слишком большой. Максимум 100 МБ' });
  }
  return res.status(400).json({ error: error.message || 'Ошибка загрузки файла' });
});

module.exports = router;
