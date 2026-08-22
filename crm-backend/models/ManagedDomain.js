const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ManagedDomain = sequelize.define('ManagedDomain', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  domain: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(255), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastSeenAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'managed_domains',
  timestamps: true,
});

module.exports = ManagedDomain;

