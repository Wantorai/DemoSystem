const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RolePermissionParam = sequelize.define('RolePermissionParam', {
    roleId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    permissionParamId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    allowed: { type: DataTypes.BOOLEAN, allowNull: false },
    canEdit: { type: DataTypes.BOOLEAN, allowNull: false },
    canCheck: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
    tableName: 'role_permission_params',
    timestamps: false,
});

module.exports = RolePermissionParam;
