// models/OrderConfig.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const Order = require('./Order'); // Импортируем модель заказа


const OrderConfig = sequelize.define('OrderConfig', {
    id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    },
    data: {
    type: DataTypes.JSONB, // Поле для хранения динамических параметров в формате JSON
    allowNull: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
          model: Order, // Ссылка на таблицу заказов
          key: 'id',    // Поле, на которое идет ссылка
      },
      onUpdate: 'CASCADE', // Автообновление при изменении id заказа
      onDelete: 'CASCADE', // Удаление готовности при удалении заказа
    },
    addon_id: {
      type: DataTypes.INTEGER,
      allowNull: false, // 
  },
}, {
    tableName: 'order_configs',
    timestamps: false,
  });


  

module.exports = OrderConfig;  