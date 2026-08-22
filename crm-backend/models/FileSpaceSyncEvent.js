const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceSyncEvent = sequelize.define('FileSpaceSyncEvent', {
  sequence: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  eventType: { type: DataTypes.STRING(30), allowNull: false },
  entityType: { type: DataTypes.STRING(20), allowNull: false },
  entityId: { type: DataTypes.UUID, allowNull: false },
  rootFolderId: { type: DataTypes.UUID, allowNull: true },
  folderId: { type: DataTypes.UUID, allowNull: true },
  versionId: { type: DataTypes.UUID, allowNull: true },
  payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  createdAt: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'filespace_sync_events',
  timestamps: true,
  updatedAt: false,
});

module.exports = FileSpaceSyncEvent;
