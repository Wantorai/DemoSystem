const db = require('../models');
const { Op } = require('sequelize');
const Client = db.sequelize.models.Client;

// Создание нового клиента
const createClient = async (req, res) => {
    const { name, email, phone, representative, representativePhone } = req.body;

    try {
        if (!name || !phone) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const client = await Client.create({ name, email, phone, representative, representativePhone });
        res.status(201).json(client);
    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Обновление информации о клиенте
const updateClient = async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, representative, representativePhone } = req.body;

    try {
        const client = await Client.findByPk(id);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        client.name = name || client.name;
        client.email = email || client.email;
        client.phone = phone || client.phone;
        client.representative = representative || client.representative;
        client.representativePhone = representativePhone || client.representativePhone;

        await client.save();
        res.status(200).json(client);
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Удаление клиента
const deleteClient = async (req, res) => {
    const { id } = req.params;

    try {
        const client = await Client.findByPk(id);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }

        await client.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получение списка всех клиентов
const allClients = async (req, res) => {
    try {
        const clients = await Client.findAll();
        res.status(200).json(clients);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить клиента по ID
const getClientById = async (req, res) => {
    const { id } = req.params;
    try {
        const client = await Client.findByPk(id);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.status(200).json(client);
    } catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// Поиск по клиентам
const searchClients = async (req, res) => {
    // console.log('Вызвали searchClients')

    // const { query } = req.query; // Получаем строку из запроса 
    const query = req.query.search;

    // Проверяем, получен ли параметр query
    if (!query) {
        return res.status(400).json({ error: 'Параметр query обязателен' });
    }

    try {
        // Выполняем поиск по имени с использованием LIKE
        const clients = await Client.findAll({
            where: {
                name: { [Op.iLike]: `%${query}%` }, // Case-insensitive поиск
            },
        });

        // Отправляем найденные данные
        res.json(clients);
    } catch (error) {
        console.error('Ошибка при поиске клиентов:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};




module.exports = { createClient, updateClient, deleteClient, allClients, getClientById, searchClients };
