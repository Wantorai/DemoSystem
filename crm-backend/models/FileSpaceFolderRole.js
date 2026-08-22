const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceFolderRole = sequelize.define('FileSpaceFolderRole', {
  folderId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
  roleId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
}, {
  tableName: 'filespace_folder_roles',
  timestamps: true,
});

module.exports = FileSpaceFolderRole;
