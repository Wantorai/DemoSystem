// models/UserConsultChat.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const UserConsultChat = sequelize.define('UserConsultChat', {
  userId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  lastReadChatMessageId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: 'user_consult_chat',
  timestamps: true,
});

module.exports = UserConsultChat;
