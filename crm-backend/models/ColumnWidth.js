// models/ColumnWidth.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


const ColumnWidth = sequelize.define('ColumnWidth', {
    columnName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'column_width',
    timestamps: false,
  });
  
  module.exports = ColumnWidth;