// models/StatusColor.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');



const StatusColor = sequelize.define('StatusColor', {
    status: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // Чтобы каждое состояние имело только одну запись
    },
    color: {
    type: DataTypes.STRING,
    allowNull: false, // HEX-код или RGB
    },
}, {
    tableName: 'status_colors',
    timestamps: false,
});
  

module.exports = StatusColor;