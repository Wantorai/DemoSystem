const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceFileVersion = sequelize.define('FileSpaceFileVersion', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  fileId: { type: DataTypes.UUID, allowNull: false },
  baseVersionId: { type: DataTypes.UUID, allowNull: true },
  versionNumber: { type: DataTypes.INTEGER, allowNull: true },
  objectKey: { type: DataTypes.STRING(1024), allowNull: false, unique: true },
  authorId: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  contentType: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'application/octet-stream' },
  size: { type: DataTypes.BIGINT, allowNull: false },
  etag: { type: DataTypes.STRING(255), allowNull: true },
  source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'web' },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ready' },
  scanStatus: {
    type: DataTypes.ENUM('pending', 'scanning', 'clean', 'infected', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'pending',
  },
  scanResult: { type: DataTypes.STRING(1000), allowNull: true },
  scanAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  scannedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'filespace_file_versions',
  timestamps: true,
});

module.exports = FileSpaceFileVersion;
