// models/Permission.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Permission = sequelize.define('Permission', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    resource: { type: DataTypes.STRING, allowNull: false }, // Например: "workVendor/[id]"
    label: { type: DataTypes.STRING, allowNull: false }, // Название разрешения (например, "Просмотр клиентов")
}, {
    tableName: 'permissions',
    timestamps: false,
});

module.exports = Permission;
