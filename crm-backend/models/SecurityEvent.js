const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const SecurityEvent = sequelize.define(
  'SecurityEvent',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    eventType: { type: DataTypes.STRING(50), allowNull: false },
    severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'warning' },
    ipAddress: { type: DataTypes.STRING(100), allowNull: true },
    origin: { type: DataTypes.STRING(500), allowNull: true },
    host: { type: DataTypes.STRING(255), allowNull: true },
    method: { type: DataTypes.STRING(12), allowNull: true },
    path: { type: DataTypes.STRING(500), allowNull: true },
    statusCode: { type: DataTypes.INTEGER, allowNull: true },
    username: { type: DataTypes.STRING(160), allowNull: true },
    userAgent: { type: DataTypes.STRING(1000), allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'security_events',
    timestamps: true,
    indexes: [
      { fields: ['occurredAt'] },
      { fields: ['eventType', 'occurredAt'] },
      { fields: ['ipAddress', 'occurredAt'] },
    ],
  }
);

module.exports = SecurityEvent;
