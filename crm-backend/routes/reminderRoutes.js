const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  listReminderOptions,
  listReminders,
  createReminder,
  updateReminder,
  setReminderPaused,
  deleteReminder,
  sendReminderNow,
} = require('../controllers/reminderController');

router.get('/admin/reminders/options', auth, listReminderOptions);
router.get('/admin/reminders', auth, listReminders);
router.post('/admin/reminders', auth, createReminder);
router.patch('/admin/reminders/:id', auth, updateReminder);
router.post('/admin/reminders/:id/pause', auth, (req, res, next) => {
  req.body = { ...(req.body || {}), paused: true };
  return setReminderPaused(req, res, next);
});
router.post('/admin/reminders/:id/resume', auth, (req, res, next) => {
  req.body = { ...(req.body || {}), paused: false };
  return setReminderPaused(req, res, next);
});
router.post('/admin/reminders/:id/send-now', auth, sendReminderNow);
router.delete('/admin/reminders/:id', auth, deleteReminder);

module.exports = router;

