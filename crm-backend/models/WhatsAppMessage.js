const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const WhatsAppMessage = sequelize.define('WhatsAppMessage', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  wChatId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  whatsappMessageId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '',
  },
  fromMe: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },
  attachments: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null,
  },
  messageType: {
    type: DataTypes.ENUM('text', 'audio', 'image', 'video', 'document'),
    allowNull: false,
    defaultValue: 'text',
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  senderName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  senderId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'whatsapp_messages',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['wChatId', 'whatsappMessageId'],
      name: 'whatsapp_messages_chat_message_unique',
    },
  ],
  hooks: {
    afterCreate: async (message) => {
      const chat = await message.getWhatsAppChat();
      if (!chat) return;
      await chat.update({
        unreadCount: message.fromMe ? chat.unreadCount : Number(chat.unreadCount || 0) + 1,
        lastMessageText: message.text || null,
        lastMessageTime: message.createdAt || new Date(),
      });
    },
  },
});

module.exports = WhatsAppMessage;

