// File: models/Technic.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Technic = sequelize.define('Technic', {
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
  viewAllCRM: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Устанавливаем значение по умолчанию как false
  },
  color: {
    type: DataTypes.STRING,
    allowNull: true, // HEX-код или RGB
  },
}, {
  tableName: 'technics',
  // timestamps: false,
});

module.exports = Technic;

