const express = require("express");
const router = express.Router();
const {
  getAllPermissionParams,
  createPermissionParam,
  updatePermissionParam,
  deletePermissionParam,
  // syncPermissionParam,
  getAllRolePermissionParams,
  getAllPermissionParamsFromPostgres,
  getPermissionParamById
} = require("../controllers/permissionParamController");

router.get("/admin/permissionParams", getAllPermissionParams);
router.post("/admin/permissionParams", createPermissionParam);
// router.post("/admin/permissionParams/sync-permissionParams/", syncPermissionParam);
router.put("/admin/permissionParams/:id", updatePermissionParam);
router.get("/admin/permissionParams/:id",   getPermissionParamById);
router.delete("/admin/permissionParams/:paramId", deletePermissionParam);


router.get("/permissionParams", getAllPermissionParamsFromPostgres);
router.get("/role_permissionParams/:roleId", getAllRolePermissionParams);



module.exports = router;
