require('dotenv').config();

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, String(process.env.DB_PASSWORD), {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    logging: (msg) => {
        if (msg.startsWith("Executing")) return; // пропускаем SQL-запросы
        //console.log(msg); // кастомные логи
      } 
});

module.exports = sequelize;
