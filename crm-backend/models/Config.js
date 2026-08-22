// models/Config.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const Configs = require('./Configs');

const Config = sequelize.define("Config", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  paramName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'string', // по умолчанию тип 
  },
  source: {
    type: DataTypes.STRING, // Внешний источник, если тип 'list'
    allowNull: true,
  },
  sorting: {
    type: DataTypes.INTEGER, // Для сортировки
    defaultValue: 0, // По умолчанию
  },
  configId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Configs, // Название таблицы `configs`
      key: "id",
    },
  },
  width: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  newLabel: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  
}, {
  tableName: 'config',
  timestamps: false,
});

module.exports = Config;
