const express = require("express");
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

const {
  getAllRoles,
  getAllPermissions,
  getRolePermissions,
  updateRolePermissions,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getAllPermissionParams,
  getRolePermissionParams,
  updateRolePermissionParams
} = require("../controllers/roleController");

router.get("/admin/roles/permissions", authMiddleware, getAllPermissions);
router.get("/admin/roles/permissionParams", authMiddleware, getAllPermissionParams);

router.get("/admin/roles/:roleId/permissions", authMiddleware, getRolePermissions);
router.get("/admin/roles/:roleId/permissionParams", authMiddleware, getRolePermissionParams);

router.post("/admin/roles/:roleId/permissions", authMiddleware, updateRolePermissions);
router.post("/admin/roles/:roleId/permissionParams", authMiddleware, updateRolePermissionParams);

router.get("/admin/roles", authMiddleware, getAllRoles);
router.get('/admin/roles/:id', authMiddleware, getRoleById);
router.post('/admin/roles', authMiddleware, createRole);
router.put('/admin/roles/:id', authMiddleware, updateRole);
router.delete('/admin/roles/:id', authMiddleware, deleteRole);

module.exports = router;
