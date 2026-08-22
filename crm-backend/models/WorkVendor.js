// models/WorkVendor.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const WorkVendor = sequelize.define('WorkVendor', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'work_vendors',
  // timestamps: false,
});

module.exports = WorkVendor;