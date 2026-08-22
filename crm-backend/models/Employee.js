// models/Employee.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


const Employee = sequelize.define('Employee', {
      fullNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      telegramId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
    }, {
      tableName: 'employees',
      timestamps: false, // если не нужны createdAt/updatedAt
    });

module.exports = Employee;  