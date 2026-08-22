// routes/roomRoutes.js
const express = require('express');
const router = express.Router();
const { createRoom, listRoomsForAdmin, listRoomsForApp, getRoom, updateRoom, deleteRoom, getRoomUsers, 
    listRoomsForWeb, autoCreatePersonalChats, getOrCreatePersonalRoom, getAvailableUsersForPersonalChat,
    getAvailableUsersForRoomCreation, createGroupRoom, updateGroupRoomParticipants, createGroupRoomExternalInvite, deleteGroupRoomExternalParticipant, setRoomArchive, markRoomAsRead, deleteOwnRoom
} = require('../controllers/roomController');

const authMiddleware = require('../middleware/authMiddleware');

router.post('/admin/rooms', authMiddleware, createRoom); // POST /admin/rooms
router.get('/admin/rooms', authMiddleware, listRoomsForAdmin);
router.get('/app/rooms', authMiddleware, listRoomsForApp);
router.put('/app/rooms/:id/read', authMiddleware, markRoomAsRead);
router.put('/app/rooms/:id/archive', authMiddleware, setRoomArchive);
router.delete('/app/rooms/:id', authMiddleware, deleteOwnRoom);
router.get('/web/rooms', authMiddleware, listRoomsForWeb);
router.get('/rooms/available-users', authMiddleware, getAvailableUsersForRoomCreation);
router.post('/rooms/group', authMiddleware, createGroupRoom);
router.put('/rooms/group/:id/participants', authMiddleware, updateGroupRoomParticipants);
router.post('/rooms/group/:id/external-invite', authMiddleware, createGroupRoomExternalInvite);
router.delete('/rooms/group/:id/external-participants/:participantId', authMiddleware, deleteGroupRoomExternalParticipant);
router.get('/admin/rooms/:id', authMiddleware, getRoom);
router.put('/admin/rooms/:id', authMiddleware, updateRoom);
router.delete('/admin/rooms/:id', authMiddleware, deleteRoom);
router.get('/admin/rooms/:id/users', authMiddleware, getRoomUsers)

router.post('/personal/auto-create', authMiddleware, autoCreatePersonalChats);
router.get('/personal/:otherUserId', authMiddleware, getOrCreatePersonalRoom);
router.get('/personal/available-users', authMiddleware, getAvailableUsersForPersonalChat);

module.exports = router;
