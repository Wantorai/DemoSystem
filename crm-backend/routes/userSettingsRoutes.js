const express = require('express');
const auth = require('../middleware/authMiddleware');
const {
  getMyMobileTextScale,
  setMyMobileTextScale,
  getMyAutoReply,
  setMyAutoReply,
  getMyClientAutoReply,
  setMyClientAutoReply,
  getMyMessageSound,
  setMyMessageSound,
  getMyPersonalNote,
  setMyPersonalNote,
} = require('../controllers/userSettingsController');

const router = express.Router();

router.get('/user-settings/mobile-text-scale', auth, getMyMobileTextScale);
router.put('/user-settings/mobile-text-scale', auth, setMyMobileTextScale);
router.get('/user-settings/auto-reply', auth, getMyAutoReply);
router.put('/user-settings/auto-reply', auth, setMyAutoReply);
router.get('/user-settings/client-auto-reply', auth, getMyClientAutoReply);
router.put('/user-settings/client-auto-reply', auth, setMyClientAutoReply);
router.get('/user-settings/message-sound', auth, getMyMessageSound);
router.put('/user-settings/message-sound', auth, setMyMessageSound);
router.get('/user-settings/personal-note', auth, getMyPersonalNote);
router.put('/user-settings/personal-note', auth, setMyPersonalNote);

module.exports = router;

