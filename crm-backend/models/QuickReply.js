const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuickReply = sequelize.define(
  'QuickReply',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'quick_replies',
    timestamps: true,
  }
);

module.exports = QuickReply;
