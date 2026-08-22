const express = require("express");
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,
  toggleUserChatPermission,
  toggleUserMaxPermission,
  toggleUserTelegramPermission,
  toggleUserWhatsAppPermission,
  getRemoteRoles,
  getRemotePermissionsBundle,
  updateRemoteRolePermissions,
  updateRemotePermissionLabel,
  updateRemoteProAccess,
  createRemoteUser,
  getRemoteUsers,
  updateRemoteUser,
  deleteRemoteUser,
  toggleRemoteUserActive,
  toggleRemoteUserChatPermission,
  toggleRemoteUserMaxPermission,
  toggleRemoteUserTelegramPermission,
  toggleRemoteUserWhatsAppPermission,
  getManagedDomains,
  upsertManagedDomain,
  deleteManagedDomain,
  getUsersAccessMode,
} = require('../controllers/userController');

// CRUD маршруты
router.get("/admin/users/", authMiddleware, getAllUsers);
router.get("/admin/users/access-mode", authMiddleware, getUsersAccessMode);
router.get("/admin/users/:id", authMiddleware, getUserById);
router.post("/admin/users/", authMiddleware, createUser);
router.put("/admin/users/:id", authMiddleware, updateUser);
router.delete("/admin/users/:id", authMiddleware, deleteUser);
router.put('/admin/users/:id/toggle-active', authMiddleware, toggleUserActive);
router.put('/admin/users/:id/toggle-chat', authMiddleware, toggleUserChatPermission);
router.put('/admin/users/:id/toggle-max', authMiddleware, toggleUserMaxPermission);
router.put('/admin/users/:id/toggle-telegram', authMiddleware, toggleUserTelegramPermission);
router.put('/admin/users/:id/toggle-whatsapp', authMiddleware, toggleUserWhatsAppPermission);
router.get('/admin/remote/roles', authMiddleware, getRemoteRoles);
router.get('/admin/remote/permissions/bundle', authMiddleware, getRemotePermissionsBundle);
router.post('/admin/remote/roles/:roleId/permissions', authMiddleware, updateRemoteRolePermissions);
router.put('/admin/remote/permissions/pro-access', authMiddleware, updateRemoteProAccess);
router.put('/admin/remote/permissions/:id', authMiddleware, updateRemotePermissionLabel);
router.get('/admin/remote/users', authMiddleware, getRemoteUsers);
router.post('/admin/remote/users', authMiddleware, createRemoteUser);
router.put('/admin/remote/users/:id', authMiddleware, updateRemoteUser);
router.delete('/admin/remote/users/:id', authMiddleware, deleteRemoteUser);
router.put('/admin/remote/users/:id/toggle-active', authMiddleware, toggleRemoteUserActive);
router.put('/admin/remote/users/:id/toggle-chat', authMiddleware, toggleRemoteUserChatPermission);
router.put('/admin/remote/users/:id/toggle-max', authMiddleware, toggleRemoteUserMaxPermission);
router.put('/admin/remote/users/:id/toggle-telegram', authMiddleware, toggleRemoteUserTelegramPermission);
router.put('/admin/remote/users/:id/toggle-whatsapp', authMiddleware, toggleRemoteUserWhatsAppPermission);
router.get('/admin/managed-domains', authMiddleware, getManagedDomains);
router.post('/admin/managed-domains', authMiddleware, upsertManagedDomain);
router.delete('/admin/managed-domains/:id', authMiddleware, deleteManagedDomain);

module.exports = router;
