// models/ConfigLinks.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ConfigLink = sequelize.define("ConfigLink", {
    path: { type: DataTypes.STRING, allowNull: false, unique: true },
    label: { type: DataTypes.STRING, allowNull: false },
    style: { type: DataTypes.STRING, allowNull: false },
    }, {
    tableName: 'config_links',
    timestamps: false,
  });
  
  module.exports = ConfigLink;
  

