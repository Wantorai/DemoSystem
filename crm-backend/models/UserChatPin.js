const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const UserChatPin = sequelize.define(
  'UserChatPin',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    pinKey: { type: DataTypes.STRING(191), allowNull: false },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: 'user_chat_pins',
    timestamps: true,
    indexes: [
      { fields: ['userId', 'orderIndex'] },
      { unique: true, fields: ['userId', 'pinKey'], name: 'user_chat_pins_user_pin_unique' },
    ],
  }
);

module.exports = UserChatPin;
