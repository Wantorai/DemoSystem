const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const WhatsAppChat = sequelize.define('WhatsAppChat', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  whatsappChatId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  botType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'business',
  },
  whatsappUserId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  unreadCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  lastMessageText: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  lastMessageTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  assigneeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  participantIds: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  isClosed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  archivedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'whatsapp_chats',
  timestamps: true,
  indexes: [{
    unique: true,
    fields: ['botType', 'whatsappChatId'],
    name: 'whatsapp_chats_bot_type_chat_id_unique',
  }],
});

module.exports = WhatsAppChat;

