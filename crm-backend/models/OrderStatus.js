// models/OrderStatus.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OrderStatus = sequelize.define("OrderStatus", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  defaultValue: {
    type: DataTypes.STRING,
    defaultValue: "", // Здесь можно указать по умолчанию пустую строку или null
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Статус активен или нет
  },
  sortOrder: {  // Новое поле для сортировки
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0, 
  },
}, {
  tableName: "order_statuses",
});

module.exports = OrderStatus;
