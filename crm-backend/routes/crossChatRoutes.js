const express = require('express');
const auth = require('../middleware/authMiddleware');
const {
  createCrossChatRequest,
  createInboundBridgeRequest,
  createInboundBridgeMessage,
  createInboundBridgeRead,
  createInboundBridgeArchive,
  createInboundBridgeDelete,
  processInboundBridgeCallback,
  listIncomingCrossChatRequests,
  listOutgoingCrossChatRequests,
  listCrossChatRoomStates,
  setCrossChatRoomArchive,
  deleteCrossChatRoom,
  acceptCrossChatRequest,
  rejectCrossChatRequest,
} = require('../controllers/crossChatController');

const router = express.Router();

router.post('/cross-chat/requests', auth, createCrossChatRequest);
router.get('/cross-chat/requests/incoming', auth, listIncomingCrossChatRequests);
router.get('/cross-chat/requests/outgoing', auth, listOutgoingCrossChatRequests);
router.get('/cross-chat/rooms/states', auth, listCrossChatRoomStates);
router.post('/cross-chat/rooms/:roomId/archive', auth, setCrossChatRoomArchive);
router.delete('/cross-chat/rooms/:roomId', auth, deleteCrossChatRoom);
router.post('/cross-chat/requests/:id/accept', auth, acceptCrossChatRequest);
router.post('/cross-chat/requests/:id/reject', auth, rejectCrossChatRequest);
router.post('/cross-chat/bridge/request', createInboundBridgeRequest);
router.post('/cross-chat/bridge/message', createInboundBridgeMessage);
router.post('/cross-chat/bridge/read', createInboundBridgeRead);
router.post('/cross-chat/bridge/archive', createInboundBridgeArchive);
router.post('/cross-chat/bridge/delete', createInboundBridgeDelete);
router.post('/cross-chat/bridge/callback', processInboundBridgeCallback);

module.exports = router;
