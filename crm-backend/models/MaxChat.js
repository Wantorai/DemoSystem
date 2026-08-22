// models/MaxChat.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const MaxChat = sequelize.define('MaxChat', {

    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    maxChatId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    maxUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    botType: {
      type: DataTypes.ENUM('business', 'personal'),
      allowNull: false,
      defaultValue: 'business',
    },

    // НОВОЕ ПОЛЕ: количество непрочитанных сообщений (денормализация для производительности)
    unreadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    // НОВОЕ ПОЛЕ: текст последнего сообщения (денормализация)
    lastMessageText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // НОВОЕ ПОЛЕ: время последнего сообщения (денормализация)
    lastMessageTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users', // таблица пользователей
        key: 'id'
      }
    },
    participantIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    
    isClosed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }

  },
  {
    tableName: 'max_chats',
    timestamps: true,
  }
);



module.exports = MaxChat;

