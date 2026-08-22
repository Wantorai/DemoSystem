const db = require('../models');
const WorkVendor = db.sequelize.models.WorkVendor;

// Создание нового подрядчика
const createWorkVendor = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All workVendors are required' });
        }

        const workVendor = await WorkVendor.create({ name });
        res.status(201).json(workVendor);
    } catch (error) {
        console.error('Error creating workVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о подрядчикае
const updateWorkVendor = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const workVendor = await WorkVendor.findByPk(id);
        if (!workVendor) {
            return res.status(404).json({ error: 'WorkVendor not found' });
        }

        workVendor.name = name || workVendor.name;

        await workVendor.save();
        res.status(200).json(workVendor);
    } catch (error) {
        console.error('Error updating workVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление подрядчика
const deleteWorkVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const workVendor = await WorkVendor.findByPk(id);
        if (!workVendor) {
            return res.status(404).json({ error: 'WorkVendor not found' });
        }

        await workVendor.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting workVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех подрядчиков
const allWorkVendors = async (req, res) => {
    try {
        const workVendors = await WorkVendor.findAll();
        res.status(200).json(workVendors);
    } catch (error) {
        console.error('Error fetching workVendors:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить подрядчика по ID
const getWorkVendorById = async (req, res) => {
    const { id } = req.params;
    try {
        const workVendor = await WorkVendor.findByPk(id);
        if (!workVendor) {
            return res.status(404).json({ error: 'WorkVendor not found' });
        }
        res.status(200).json(workVendor);
    } catch (error) {
        console.error('Error fetching workVendor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createWorkVendor, updateWorkVendor, deleteWorkVendor, allWorkVendors, getWorkVendorById };
