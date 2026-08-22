// models/Infosource.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const InfoSource = sequelize.define('InfoSource', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'info_sources',
  timestamps: false,
});

module.exports = InfoSource;