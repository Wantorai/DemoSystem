const { DataTypes, Sequelize } = require("sequelize");
const sequelize = require("../config/database"); // Подключаем БД


const SimpleEvent = sequelize.define("SimpleEvent", {
  id: {
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataTypes.INTEGER,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  start: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal("NOW() AT TIME ZONE 'UTC'"), // Храним в UTC
  },
  end: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: Sequelize.literal("NOW() AT TIME ZONE 'UTC'"), // Храним в UTC
  },
  allDay: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  resourceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "simple", 
  },
  sticky: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
    tableName: 'simple_events',
    timestamps: false,
});

module.exports = SimpleEvent;
