// models/AppVersion.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const AppVersion = sequelize.define('AppVersion', {
  type: {
    type: DataTypes.ENUM('update', 'build'),
    allowNull: false,
    comment: 'Тип: update (EAS Update) или build (Production Build)',
  },
  version: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Номер версии, например 1.0.5',
  },
  status: {
    type: DataTypes.ENUM('active', 'blocked'),
    allowNull: false,
    defaultValue: 'active',
    comment: 'active = разрешено, blocked = заблокировано (ждем новый build)',
  },
}, {
  tableName: 'app_versions',
});

module.exports = AppVersion;
