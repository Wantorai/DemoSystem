const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  listAlertOptions,
  createAlert,
  listAlerts,
  listAlertSummary,
  listUnreadTotal,
  markAlertRead,
  getAlertRecipients,
  updateAlert,
  deleteAlert,
} = require('../controllers/alertController');

router.get('/admin/alerts/options', auth, listAlertOptions);
router.get('/admin/alerts', auth, listAlerts);
router.get('/admin/alerts/summary', auth, listAlertSummary);
router.get('/admin/alerts/unread-total', auth, listUnreadTotal);
router.post('/admin/alerts', auth, createAlert);
router.patch('/admin/alerts/:id', auth, updateAlert);
router.post('/admin/alerts/:id/read', auth, markAlertRead);
router.get('/admin/alerts/:id/recipients', auth, getAlertRecipients);
router.delete('/admin/alerts/:id', auth, deleteAlert);

module.exports = router;
