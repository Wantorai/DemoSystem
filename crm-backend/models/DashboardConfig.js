// models/DashboardConfig.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


  const DashboardConfig = sequelize.define('DashboardConfig', {
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    endpoint: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dateField: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    valueFields: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    refNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    refNumberWeek: { type: DataTypes.INTEGER, allowNull: true },
    color: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '#3182ce',
    },
    order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    },
    series: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  }, {
    tableName: 'dashboard_configs',
  });


module.exports = DashboardConfig;  
