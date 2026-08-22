'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
} = require('../controllers/quickReplyController');

router.get('/admin/quick-replies', auth, listQuickReplies);
router.post('/admin/quick-replies', auth, createQuickReply);
router.patch('/admin/quick-replies/:id', auth, updateQuickReply);
router.delete('/admin/quick-replies/:id', auth, deleteQuickReply);

module.exports = router;
