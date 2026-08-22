// models/Addon.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Addon = sequelize.define('Addon', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  defaultLoad: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Значение по умолчанию false
    allowNull: false, // Убедитесь, что это поле не может быть null
  },
}, {
  tableName: 'addons',
  timestamps: false, // Поля createdAt/updatedAt
});

module.exports = Addon;
