const db = require('../models');
const EventInfo = db.sequelize.models.EventInfo;



// Получить все записи
const getAllEventInfos = async (req, res) => {
    try {
        const eventInfos = await EventInfo.findAll();
        res.json(eventInfos);
    } catch (error) {
        res.status(500).json({ error: "Ошибка при получении данных" });
    }
};

// Получить запись по ID
const getEventInfoById = async (req, res) => {
    try {
        const eventInfo = await EventInfo.findByPk(req.params.id);
        if (!eventInfo) {
            return res.status(404).json({ error: "Запись не найдена" });
        }
        res.json(eventInfo);
    } catch (error) {
        res.status(500).json({ error: "Ошибка при получении записи" });
    }
};

// Создать новую запись
const createEventInfo = async (req, res) => {
    try {
        // console.log("req.body:", req.body); // Посмотрим, что приходит в запросе

        const { newParams } = req.body; // Получаем массив из req.body

        if (!Array.isArray(newParams)) {
            return res.status(400).json({ error: "Ожидался массив объектов в поле 'newParams'" });
        }

        const eventData = newParams.map(item => ({
            paramName: item.paramName,
            paramLabel: item.label, 
            allowed: false  // Устанавливаем allowed по умолчанию в false
        }));

        const newEventInfos = await EventInfo.bulkCreate(eventData);
        res.status(201).json(newEventInfos);
    } catch (error) {
        console.error("Ошибка при создании записей:", error);
        res.status(500).json({ error: "Ошибка при создании записей" });
    }
};



// Обновить запись
const updateEventInfo = async (req, res) => {
    try {
        const { paramName, paramLabel, allowed } = req.body;
        const eventInfo = await EventInfo.findByPk(req.params.id);
        if (!eventInfo) {
            return res.status(404).json({ error: "Запись не найдена" });
        }
        await eventInfo.update({ paramName, paramLabel, allowed });
        // console.log("eventInfo = ", eventInfo)
        res.json(eventInfo);
    } catch (error) {
        res.status(500).json({ error: "Ошибка при обновлении записи" });
    }
};




// массовое обновление
const updateEventInfos = async (req, res) => {
    try {
        const { updatedParams } = req.body;

        // console.log("updatedParams = ", updatedParams)

        if (!Array.isArray(updatedParams)) {
            return res.status(400).json({ error: "Ожидался массив объектов" });
        }

        await Promise.all(
            updatedParams.map(({ paramId, paramLabel, allowed }) =>
                EventInfo.update({ paramLabel, allowed }, { where: { paramId } })
            )
        );

        const newData = await EventInfo.findAll();
        res.json(newData);

        // console.log("newData = ", newData)

    } catch (error) {
        console.error("Ошибка при обновлении записей:", error);
        res.status(500).json({ error: "Ошибка при обновлении записей" });
    }
};



module.exports = { getAllEventInfos, getEventInfoById, createEventInfo, updateEventInfo, updateEventInfos };