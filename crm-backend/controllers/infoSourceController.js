const db = require('../models');
const InfoSource = db.sequelize.models.InfoSource;

// Создание нового типа оплаты
const createInfoSource = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All infoSources are required' });
        }

        const infoSource = await InfoSource.create({ name });
        res.status(201).json(infoSource);
    } catch (error) {
        console.error('Error creating infoSource:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о типе оплаты
const updateInfoSource = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const infoSource = await InfoSource.findByPk(id);
        if (!infoSource) {
            return res.status(404).json({ error: 'InfoSource not found' });
        }

        infoSource.name = name || infoSource.name;

        await infoSource.save();
        res.status(200).json(infoSource);
    } catch (error) {
        console.error('Error updating infoSource:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление типа оплаты
const deleteInfoSource = async (req, res) => {
    const { id } = req.params;

    try {
        const infoSource = await InfoSource.findByPk(id);
        if (!infoSource) {
            return res.status(404).json({ error: 'InfoSource not found' });
        }

        await infoSource.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting infoSource:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех типов оплаты
const allInfoSources = async (req, res) => {
    try {
        const infoSources = await InfoSource.findAll();
        res.status(200).json(infoSources);
    } catch (error) {
        console.error('Error fetching infoSources:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить тип оплаты по ID
const getInfoSourceById = async (req, res) => {
    const { id } = req.params;
    try {
        const infoSource = await InfoSource.findByPk(id);
        if (!infoSource) {
            return res.status(404).json({ error: 'InfoSource not found' });
        }
        res.status(200).json(infoSource);
    } catch (error) {
        console.error('Error fetching infoSource:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createInfoSource, updateInfoSource, deleteInfoSource, allInfoSources, getInfoSourceById };
