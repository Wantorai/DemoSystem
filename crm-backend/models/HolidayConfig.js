// models/HolidayConfig.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const HolidayConfig = sequelize.define('HolidayConfig', {
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      unique: true, // каждая дата должна быть уникальной
    },
    isHoliday: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true, // по умолчанию – выходной
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    }, {
    tableName: 'holidays',
    timestamps: false,
    });

module.exports = HolidayConfig;