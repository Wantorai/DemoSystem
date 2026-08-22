// models/Installer.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Installer = sequelize.define('Installer', {
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
  color: {
    type: DataTypes.STRING,
    allowNull: true,   // hex-код или CSS-имя цвета, например "#4caf50"
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,   // сортировка статусов, например: 1, 2, 3 и т.д.
    defaultValue: null,
  },
  active: {  
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true, // По умолчанию активен
  },        
}, {
  tableName: 'installers',
  //timestamps: false,
});

module.exports = Installer;
