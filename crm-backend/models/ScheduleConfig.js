// models/ScheduleConfig.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ScheduleConfig = sequelize.define('ScheduleConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    schedule_config: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
}, {
    tableName: 'schedule_config',
    timestamps: false,
});

module.exports = ScheduleConfig;