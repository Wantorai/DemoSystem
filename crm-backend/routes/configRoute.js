// routes/configRoute.js

const express = require("express");
const { getAllConfigs, updateConfig, deleteConfig, saveConfig, initConfig, getConfigParamByAddonId, updateAddonConfigParams, updateOrder } = require("../controllers/configController");
const router = express.Router();

router.get("/addons/:addonId/config", getConfigParamByAddonId); // Получить все параметры конфигурации
router.post("/addons/:addonId/config", saveConfig); // Создать конфигурацию
router.put("/addons/:addonId/config/:id", updateConfig); // Обновить параметры конфигурации
router.delete("/addons/:addonId/config/:id", deleteConfig); // Удалить параметры конфигурации
router.post("/addons/:addonId/config/init", initConfig); // Инициализация конфигурации 
router.get("/config", getAllConfigs)   
router.post("/addons/:addonId/config/params", updateAddonConfigParams); // Обновить параметры конфигурации
router.patch("/addons/:addonId/config/order", updateOrder) // Обновить порядок вывода

module.exports = router;
