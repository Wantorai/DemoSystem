const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const EventInfo = sequelize.define('EventInfo', {
    paramId: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    paramName: { type: DataTypes.STRING, allowNull: false }, // Например: "param1"
    paramLabel: { type: DataTypes.STRING, allowNull: false}, // Обозначение
    allowed: { type: DataTypes.BOOLEAN, allowNull: false },
}, {
    tableName: 'event_infos',
    timestamps: false,
});

module.exports = EventInfo;
