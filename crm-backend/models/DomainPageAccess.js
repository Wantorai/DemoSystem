const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DomainPageAccess = sequelize.define('DomainPageAccess', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  permissionId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  proEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'domain_page_accesses',
  timestamps: true,
});

module.exports = DomainPageAccess;
