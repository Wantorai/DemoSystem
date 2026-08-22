// models/StatusColorCRM.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');



const StatusColorCRM = sequelize.define('StatusColorCRM', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,       // например: "ACTIVE", "DRAFT", "COMPLETED"
      },
      label: {
        type: DataTypes.STRING,
        allowNull: false,   // например: "Активен", "Черновик", "Завершен"
      },
      color: {
        type: DataTypes.STRING,
        allowNull: false,   // hex-код или CSS-имя цвета, например "#4caf50"
      },
      order: {
        type: DataTypes.INTEGER,
        allowNull: false,   // сортировка статусов, например: 1, 2, 3 и т.д.
        defaultValue: null,
      }      
    },  {
    tableName: 'statuses_crm',
    timestamps: false,
});
  

module.exports = StatusColorCRM;