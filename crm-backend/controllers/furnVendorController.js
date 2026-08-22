const db = require('../models');
const FurnVendor = db.sequelize.models.FurnVendor;

// Создание нового поставщика
const createFurnVendor = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All furnVendors are required' });
        }

        const furnVendor = await FurnVendor.create({ name });
        res.status(201).json(furnVendor);
    } catch (error) {
        console.error('Error creating furnVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о поставщикае
const updateFurnVendor = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const furnVendor = await FurnVendor.findByPk(id);
        if (!furnVendor) {
            return res.status(404).json({ error: 'FurnVendor not found' });
        }

        furnVendor.name = name || furnVendor.name;

        await furnVendor.save();
        res.status(200).json(furnVendor);
    } catch (error) {
        console.error('Error updating furnVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление поставщика
const deleteFurnVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const furnVendor = await FurnVendor.findByPk(id);
        if (!furnVendor) {
            return res.status(404).json({ error: 'FurnVendor not found' });
        }

        await furnVendor.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting furnVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех поставщиков
const allFurnVendors = async (req, res) => {
    try {
        const furnVendors = await FurnVendor.findAll();
        res.status(200).json(furnVendors);
    } catch (error) {
        console.error('Error fetching furnVendors:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить поставщика по ID
const getFurnVendorById = async (req, res) => {
    const { id } = req.params;
    try {
        const furnVendor = await FurnVendor.findByPk(id);
        if (!furnVendor) {
            return res.status(404).json({ error: 'FurnVendor not found' });
        }
        res.status(200).json(furnVendor);
    } catch (error) {
        console.error('Error fetching furnVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createFurnVendor, updateFurnVendor, deleteFurnVendor, allFurnVendors, getFurnVendorById };
