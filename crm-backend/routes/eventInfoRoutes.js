const express = require("express");
const router = express.Router();
const { getAllEventInfos, getEventInfoById, createEventInfo, updateEventInfo, updateEventInfos } = require('../controllers/eventInfoController');

// CRUD маршруты
router.get("/config/eventInfos/", getAllEventInfos); // Получить всех инфособытией
router.get("/config/eventInfos/:id", getEventInfoById); // Получить инфособытия по ID
router.post("/config/eventInfos/", createEventInfo); // Создать нового инфособытия
router.put("/config/eventInfos/:id", updateEventInfo); // Обновить инфособытия
router.put("/config/eventInfos", updateEventInfos);

module.exports = router;