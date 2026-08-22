const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RolePermission = sequelize.define('RolePermission', {
    roleId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    permissionId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    allowed: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    tableName: 'role_permissions',
    timestamps: false,
});

module.exports = RolePermission;
