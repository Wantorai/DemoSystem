// routes/addonRoutes.js

const express = require("express");
const router = express.Router();

const {getAllAddons, createAddon, getAddonById, updateAddon, deleteAddon} = require("../controllers/addonController");



router.get("/admin/addons/", getAllAddons);
router.post("/admin/addons/", createAddon);
router.put("/admin/addons/:id", updateAddon);
router.get("/admin/addons/:id", getAddonById);
router.delete("/admin/addons/:id", deleteAddon);

module.exports = router;
