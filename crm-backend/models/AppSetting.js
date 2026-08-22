const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const AppSetting = sequelize.define(
  'AppSetting',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    value: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'app_settings',
    timestamps: true,
  }
);

module.exports = AppSetting;
