// models/FasadVendor.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const FasadVendor = sequelize.define('FasadVendor', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'fasad_vendors',
  //timestamps: false,
});

module.exports = FasadVendor;