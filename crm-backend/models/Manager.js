// File: models/Manager.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Manager = sequelize.define('Manager', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  viewAll: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Устанавливаем значение по умолчанию как false
  },
}, {
  tableName: 'managers',
  // timestamps: false,
});

module.exports = Manager;

