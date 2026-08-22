// models/EventConfigs.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


const EventConfig = sequelize.define("EventConfig", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    config: {
      type: DataTypes.JSONB, // Храним конфиг в формате JSONB
      allowNull: false,
    },
  }, {
    tableName: 'EventConfigs',
    timestamps: false,
});

  




module.exports = EventConfig;