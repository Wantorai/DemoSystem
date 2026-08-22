const db = require('../models');
const Paylist = db.sequelize.models.Paylist;

// Создание нового типа оплаты
const createPaylist = async (req, res) => {
    const { name } = req.body;

    try {
        if (!name) {
            return res.status(400).json({ error: 'All paylists are required' });
        }

        const paylist = await Paylist.create({ name });
        res.status(201).json(paylist);
    } catch (error) {
        console.error('Error creating paylist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о типе оплаты
const updatePaylist = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    try {
        const paylist = await Paylist.findByPk(id);
        if (!paylist) {
            return res.status(404).json({ error: 'Paylist not found' });
        }

        paylist.name = name || paylist.name;

        await paylist.save();
        res.status(200).json(paylist);
    } catch (error) {
        console.error('Error updating paylist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление типа оплаты
const deletePaylist = async (req, res) => {
    const { id } = req.params;

    try {
        const paylist = await Paylist.findByPk(id);
        if (!paylist) {
            return res.status(404).json({ error: 'Paylist not found' });
        }

        await paylist.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting paylist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех типов оплаты
const allPaylists = async (req, res) => {
    try {
        const paylists = await Paylist.findAll();
        res.status(200).json(paylists);
    } catch (error) {
        console.error('Error fetching paylists:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить тип оплаты по ID
const getPaylistById = async (req, res) => {
    const { id } = req.params;
    try {
        const paylist = await Paylist.findByPk(id);
        if (!paylist) {
            return res.status(404).json({ error: 'Paylist not found' });
        }
        res.status(200).json(paylist);
    } catch (error) {
        console.error('Error fetching paylist:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { createPaylist, updatePaylist, deletePaylist, allPaylists, getPaylistById };
