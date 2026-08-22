const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceFile = sequelize.define('FileSpaceFile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  folderId: { type: DataTypes.UUID, allowNull: false },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  objectKey: { type: DataTypes.STRING(1024), allowNull: false, unique: true },
  legacyPath: { type: DataTypes.STRING(1024), allowNull: true },
  contentType: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'application/octet-stream' },
  size: { type: DataTypes.BIGINT, allowNull: false },
  etag: { type: DataTypes.STRING(255), allowNull: true },
  currentVersionId: { type: DataTypes.UUID, allowNull: true },
  versionNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  conflictOfFileId: { type: DataTypes.UUID, allowNull: true },
  conflictBaseVersionId: { type: DataTypes.UUID, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'ready', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  scanStatus: {
    type: DataTypes.ENUM('pending', 'scanning', 'clean', 'infected', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'pending',
  },
  scanResult: { type: DataTypes.STRING(1000), allowNull: true },
  scanAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  scannedAt: { type: DataTypes.DATE, allowNull: true },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'filespace_files',
  timestamps: true,
});

module.exports = FileSpaceFile;
