// models/MainModel.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const MainModel = sequelize.define('MainModel', {
    paramName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: { // Добавим тип параметра
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'string', // по умолчанию тип string
      },
      source: {
        type: DataTypes.STRING, // Новое поле для источника списка
        allowNull: true, // Поле может быть пустым, если тип не list
      },
      order: { // Порядок расположения
        type: DataTypes.INTEGER,
        defaultValue: 0, // По умолчанию
      },
      width: { // Новое поле для хранения ширины столбца, например "150px"
        type: DataTypes.STRING,
        allowNull: true,
      },
}, {
  tableName: 'main_model',
  timestamps: false,
});

module.exports = MainModel;