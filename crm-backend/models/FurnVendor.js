// models/FurnVendor.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FurnVendor = sequelize.define('FurnVendor', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'furn_vendors',
  //timestamps: false,
});

module.exports = FurnVendor;