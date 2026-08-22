// models/PermissionParam.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const PermissionParam = sequelize.define('PermissionParam', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    param: { type: DataTypes.STRING, allowNull: false }, // Например: "param1"
    label: { type: DataTypes.STRING, allowNull: false}, // Обозначение
}, {
    tableName: 'permissions_params',
    timestamps: false,
});

module.exports = PermissionParam;
