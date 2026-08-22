// routes/configsRoute.js

const express = require("express");
const router = express.Router();

const { getConfigByAddonId, createConfigData, updateConfigData, deleteConfigData, getConfigById } = require("../controllers/configsController");


router.get("/addons/:addonId/configs", getConfigByAddonId); // Получить все данные конфигурации
router.post("/addons/:addonId/configs", createConfigData); // Создать данные конфигурации
router.get("/addons/:addonId/configs/:id", getConfigById); // Получить конфигурацию по ID
router.put("/addons/:addonId/configs/:id", updateConfigData); // Обновить данные конфигурации
router.delete("/addons/:addonId/configs/:id", deleteConfigData); // Удалить данные конфигурации



module.exports = router;
