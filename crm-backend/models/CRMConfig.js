// models/crmConfig.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const CRMConfig = sequelize.define('CRMConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  field: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  width: {
    type: DataTypes.STRING,
    defaultValue: '100px',
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  activeInside: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: true, // можно null, чтобы не ломались старые записи
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },
}, {
  tableName: 'crm_configs',
  timestamps: false,
});

module.exports = CRMConfig;
