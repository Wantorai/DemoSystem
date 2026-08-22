const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FileSpaceFolder = sequelize.define('FileSpaceFolder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  parentId: { type: DataTypes.UUID, allowNull: true },
  ownerId: { type: DataTypes.INTEGER, allowNull: false },
  kind: {
    type: DataTypes.ENUM('personal', 'shared'),
    allowNull: false,
    defaultValue: 'personal',
  },
  allRolesAccess: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'filespace_folders',
  timestamps: true,
});

module.exports = FileSpaceFolder;
