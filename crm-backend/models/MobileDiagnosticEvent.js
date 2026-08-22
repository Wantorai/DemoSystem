const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const MobileDiagnosticEvent = sequelize.define(
  'MobileDiagnosticEvent',
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    appKey: { type: DataTypes.STRING(80), allowNull: false },
    eventType: {
      type: DataTypes.ENUM('heartbeat', 'metric', 'error', 'state'),
      allowNull: false,
      defaultValue: 'metric',
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'critical'),
      allowNull: false,
      defaultValue: 'info',
    },
    deviceId: { type: DataTypes.STRING(160), allowNull: false },
    platform: { type: DataTypes.STRING(24), allowNull: true },
    runtimeVersion: { type: DataTypes.STRING(80), allowNull: true },
    appVersion: { type: DataTypes.STRING(80), allowNull: true },
    buildNumber: { type: DataTypes.STRING(80), allowNull: true },
    deviceModel: { type: DataTypes.STRING(160), allowNull: true },
    osVersion: { type: DataTypes.STRING(80), allowNull: true },
    networkType: { type: DataTypes.STRING(60), allowNull: true },
    screen: { type: DataTypes.STRING(160), allowNull: true },
    metrics: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    message: { type: DataTypes.TEXT, allowNull: true },
    occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'mobile_diagnostic_events',
    timestamps: true,
    indexes: [
      { fields: ['appKey', 'occurredAt'] },
      { fields: ['deviceId', 'occurredAt'] },
      { fields: ['eventType', 'severity'] },
      { fields: ['userId'] },
    ],
  }
);

module.exports = MobileDiagnosticEvent;
