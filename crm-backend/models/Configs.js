// models/Configs.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const Addon = require('./Addon');

const Configs = sequelize.define("Configs", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    addonId: {
      type: DataTypes.INTEGER,
      references: {
        model: Addon,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    }, {
    tableName: 'configs',
    timestamps: false,
  });
  
  module.exports = Configs;