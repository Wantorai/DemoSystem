const db = require('../models');
const FasadVendor = db.sequelize.models.FasadVendor;

// Создание нового поставщика
const createFasadVendor = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All fasadVendors are required' });
        }

        const fasadVendor = await FasadVendor.create({ name });
        res.status(201).json(fasadVendor);
    } catch (error) {
        console.error('Error creating fasadVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о поставщикае
const updateFasadVendor = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const fasadVendor = await FasadVendor.findByPk(id);
        if (!fasadVendor) {
            return res.status(404).json({ error: 'FasadVendor not found' });
        }

        fasadVendor.name = name || fasadVendor.name;

        await fasadVendor.save();
        res.status(200).json(fasadVendor);
    } catch (error) {
        console.error('Error updating fasadVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление поставщика
const deleteFasadVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const fasadVendor = await FasadVendor.findByPk(id);
        if (!fasadVendor) {
            return res.status(404).json({ error: 'FasadVendor not found' });
        }

        await fasadVendor.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting fasadVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех поставщиков
const allFasadVendors = async (req, res) => {
    try {
        const fasadVendors = await FasadVendor.findAll();
        res.status(200).json(fasadVendors);
    } catch (error) {
        console.error('Error fetching fasadVendors:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить поставщика по ID
const getFasadVendorById = async (req, res) => {
    const { id } = req.params;
    try {
        const fasadVendor = await FasadVendor.findByPk(id);
        if (!fasadVendor) {
            return res.status(404).json({ error: 'FasadVendor not found' });
        }
        res.status(200).json(fasadVendor);
    } catch (error) {
        console.error('Error fetching fasadVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createFasadVendor, updateFasadVendor, deleteFasadVendor, allFasadVendors, getFasadVendorById };
