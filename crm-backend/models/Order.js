// models/Order.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Модель заказа
const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true, // Автоинкремент для id
    },
    data: {
        type: DataTypes.JSONB, // Поле для хранения динамических параметров в формате JSON
        allowNull: false,
    },
    comment1: {
        type: DataTypes.TEXT, // Текстовый комментарий
        allowNull: true,
    },
    comment2: {
        type: DataTypes.TEXT, // Текстовый комментарий
        allowNull: true,
    },
    active: {  // Новый статус заказа
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true, // По умолчанию заказ активен
    },
}, {
    tableName: 'order',
    timestamps: false,
});


module.exports = Order;