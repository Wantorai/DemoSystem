// models/index.js


'use strict';

const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');
const db = {};

// Загрузка всех моделей из файлов
fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.js') && file !== 'index.js')
  .forEach(file => {
    const model = require(path.join(__dirname, file));

    // Добавляем модель в db, если у неё есть имя и она не undefined
    if (model && model.name && model !== undefined) {
      db[model.name] = model;
    }
  });

// Загрузка ассоциаций
require('./associations');

// Добавление экземпляра Sequelize
db.sequelize = sequelize;

console.log('Загруженные модели:', Object.keys(db));

module.exports = db;

