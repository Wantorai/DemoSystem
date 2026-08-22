// models/Role.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Role = sequelize.define('Role', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
    accessMonths: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2, 
      },
}, {
    tableName: 'roles',
    timestamps: false,
});

module.exports = Role;
