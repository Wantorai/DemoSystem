// models/BossChatUsers.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const BossChatUsers = sequelize.define('BossChatUsers', {
  chatId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
  },
  lastReadAt: { type: DataTypes.DATE, allowNull: true },

  lastReadMessageId: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
}, {
  tableName: 'boss_chat_users',
  timestamps: false,
});

module.exports = BossChatUsers;
