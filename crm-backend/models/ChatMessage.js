// models/ChatMessage.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const { attachMessageEncryptionHooks } = require('../services/messageCrypto');



const ChatMessage = sequelize.define('ChatMessage', {
  _id: {
    type: DataTypes.UUID,
    primaryKey: true,
    allowNull: false,
  },
  userId: {
    type: DataTypes.STRING, // имя техника или 'system'
    allowNull: false,
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
    type: {
    type: DataTypes.STRING, // 'text', 'image', 'audio', 'file'
    allowNull: false,
    defaultValue: 'text',
  },
  mediaUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  userRefId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
  duration: { type: DataTypes.INTEGER, allowNull: true },

  fileSize: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  replyToMessageId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'chat_messages',
      key: '_id',
    },
    onDelete: 'SET NULL',
  },

  // 🔤 Transcription fields
  transcriptionText: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  transcriptionStatus: {
    type: DataTypes.ENUM('pending', 'processing', 'done', 'failed'),
    allowNull: true,
    defaultValue: null,
  },

  transcribedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  deliveryStatus: {
    type: DataTypes.ENUM('pending', 'sending', 'sent', 'failed'),
    allowNull: true,
    defaultValue: null,
  },

}, {
  tableName: 'chat_messages',
  timestamps: false,
});

ChatMessage.associate = (models) => {
  ChatMessage.belongsTo(models.ChatMessage, {
    foreignKey: 'replyToMessageId',
    as: 'replyToMessage',
  });
};


module.exports = ChatMessage;

attachMessageEncryptionHooks(ChatMessage, ['text', 'transcriptionText']);
