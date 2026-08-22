const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceAuditLog = sequelize.define('FileSpaceAuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  actorId: { type: DataTypes.INTEGER, allowNull: true },
  action: { type: DataTypes.STRING(50), allowNull: false },
  entityType: { type: DataTypes.STRING(20), allowNull: false },
  entityId: { type: DataTypes.UUID, allowNull: true },
  entityName: { type: DataTypes.STRING(255), allowNull: true },
  folderId: { type: DataTypes.UUID, allowNull: true },
  details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'filespace_audit_logs',
  timestamps: false,
});

module.exports = FileSpaceAuditLog;
