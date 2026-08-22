// models/Field.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Field = sequelize.define('Field', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'fields',
  //timestamps: false,
});

module.exports = Field;