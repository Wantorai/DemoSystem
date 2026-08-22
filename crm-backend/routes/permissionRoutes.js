const express = require("express");
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission,
  syncPermission,
  getAllRolePermissions,
  getAllPermissionsFromPostgres,
  getProAccessByPermission,
  updateProAccessByPermission,
} = require("../controllers/permissionController");

router.get("/admin/permissions/", authMiddleware, getAllPermissions);
router.post("/admin/permissions/", authMiddleware, createPermission);
router.post("/admin/permissions/sync-permissions/", authMiddleware, syncPermission);
router.get("/admin/permissions/pro-access", authMiddleware, getProAccessByPermission);
router.put("/admin/permissions/pro-access", authMiddleware, updateProAccessByPermission);
router.put("/admin/permissions/:id", authMiddleware, updatePermission);
router.delete("/admin/permissions/:id", authMiddleware, deletePermission);

router.get("/permissions", authMiddleware, getAllPermissionsFromPostgres);
router.get("/role_permissions/:roleId", authMiddleware, getAllRolePermissions);

module.exports = router;
