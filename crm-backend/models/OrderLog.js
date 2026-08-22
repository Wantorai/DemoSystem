// models/OrderLog.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");


const OrderLog = sequelize.define('OrderLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false, // например: "created", "updated", "deleted", "status_changed"
    },
    user: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'order_logs',
    timestamps: false,
  });


module.exports = OrderLog;    