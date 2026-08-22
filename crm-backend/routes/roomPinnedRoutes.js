// routes/roomPinnedRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/authMiddleware');
const {
    listRoomPinned, pinRoomMess, unpinRoomMess, positionMessage, anchorMessageWindow, listPinnedArchive, deletePinnedArchiveItem
} = require('../controllers/roomPinnedController');

// GET /room_chats/pinned/archive
router.get('/room_chats/pinned/archive', auth, listPinnedArchive);
// DELETE /room_chats/pinned/archive/:archiveId
router.delete('/room_chats/pinned/archive/:archiveId', auth, deletePinnedArchiveItem);

// GET /room_chats/:roomId/pinned
router.get('/room_chats/:roomId/pinned', auth, listRoomPinned);

// POST /room_chats/:roomId/pin
router.post('/room_chats/:roomId/pin', auth, pinRoomMess);

// POST /room_chats/:roomId/unpin
router.post('/room_chats/:roomId/unpin', auth, unpinRoomMess);

// endpoint, который возвращает позицию/страницу сообщения
router.get('/rooms/:roomId/messages/:messageId/position', positionMessage);
// endpoint, который возвращает окно сообщений вокруг messageId (anchor)
router.get('/rooms/:roomId/messages/:messageId/anchor', auth, anchorMessageWindow);

module.exports = router;
