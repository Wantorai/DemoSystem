const db = require('../models');
const Field = db.sequelize.models.Field;

// Создание нового поле
const createField = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const field = await Field.create({ name });
        res.status(201).json(field);
    } catch (error) {
        console.error('Error creating field:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о полее
const updateField = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const field = await Field.findByPk(id);
        if (!field) {
            return res.status(404).json({ error: 'Field not found' });
        }

        field.name = name || field.name;

        await field.save();
        res.status(200).json(field);
    } catch (error) {
        console.error('Error updating field:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление поле
const deleteField = async (req, res) => {
    const { id } = req.params;

    try {
        const field = await Field.findByPk(id);
        if (!field) {
            return res.status(404).json({ error: 'Field not found' });
        }

        await field.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting field:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех полеов
const allFields = async (req, res) => {
    try {
        const fields = await Field.findAll();
        res.status(200).json(fields);
    } catch (error) {
        console.error('Error fetching fields:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить поле по ID
const getFieldById = async (req, res) => {
    const { id } = req.params;
    try {
        const field = await Field.findByPk(id);
        if (!field) {
            return res.status(404).json({ error: 'Field not found' });
        }
        res.status(200).json(field);
    } catch (error) {
        console.error('Error fetching field:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createField, updateField, deleteField, allFields, getFieldById };
