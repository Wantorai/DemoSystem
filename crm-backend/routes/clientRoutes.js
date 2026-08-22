const express = require('express');
const router = express.Router();
const { createClient, updateClient, deleteClient, allClients, getClientById, searchClients } = require('../controllers/clientController');

// Получить клиента по ID
router.get('/clients/:id', getClientById);

// POST /api/clients - Создать нового клиента
router.post('/clients', createClient);

// PUT /api/clients/:id - Обновить клиента
router.put('/clients/:id', updateClient);

// DELETE /api/clients/:id - Удалить клиента
router.delete('/clients/:id', deleteClient);


router.get('/clients', (req, res) => {
    const searchQuery = req.query.search;

    if (searchQuery) {
        // console.log(`Поиск клиентов с параметром search: ${searchQuery}`);
        searchClients(req, res); // Вызов функции поиска
    } else {
        // console.log('Возвращаем всех клиентов');
        allClients(req, res); // Вызов функции получения всех клиентов
    }
});

// GET api/clients - Получение списка всех клиентов
// router.get('/clients', allClients);


module.exports = router;
