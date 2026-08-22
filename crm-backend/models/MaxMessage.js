// models/MaxMessage.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


const MaxMessage = sequelize.define('MaxMessage', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    mChatId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },

    maxMessageId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    text: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '', // Разрешаем пустую строку
    },

    fromMe: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },

    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    },
    
    // НОВОЕ ПОЛЕ: тип сообщения
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

    // НОВОЕ ПОЛЕ: имя отправителя
    senderName: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Имя отправителя сообщения'
    },

    // НОВОЕ ПОЛЕ: ID отправителя
    senderId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'ID отправителя'
    },

  },
  
  {
    tableName: 'max_messages',
    timestamps: true,
    hooks: {
      afterCreate: async (message, options) => {
        try {
         //console.log('Hook: After create message', message.id, 'fromMe:', message.fromMe);
          
          const chat = await message.getMaxChat();
          if (!chat) {
            console.error('Chat not found for message:', message.id);
            return;
          }
          
         //console.log('Chat found:', chat.id, 'current unread:', chat.unreadCount);
          
          if (message.fromMe === false) {
            const newUnreadCount = (chat.unreadCount || 0) + 1;
           //console.log('Incrementing unreadCount to:', newUnreadCount);
            
            await chat.update({
              unreadCount: newUnreadCount,
              lastMessageText: message.text,
              lastMessageTime: message.createdAt || new Date()
            });
          } else {
           //console.log('Message from me, updating last message only');
            await chat.update({
              lastMessageText: message.text,
              lastMessageTime: message.createdAt || new Date()
            });
          }
          
         //console.log('Hook completed successfully');
        } catch (error) {
          console.error('Error in afterCreate hook:', error);
        }
      },
      
      afterUpdate: async (message, options) => {
        try {

         //console.log('🔥 HOOK afterUpdate triggered for message:', message.id);
             //console.log('Changed fields:', message.changed());
             //console.log('isRead changed:', message.changed('isRead'));
             //console.log('Current isRead:', message.isRead);
             //console.log('fromMe:', message.fromMe);


          // Проверяем, изменилось ли поле isRead и стало ли оно true
          if (message.changed('isRead') && message.isRead === true && message.fromMe === false) {
           //console.log('Hook: Message marked as read', message.id);
            
            const chat = await message.getMaxChat();
            if (chat) {
              const newUnreadCount = Math.max(0, (chat.unreadCount || 0) - 1);
             //console.log('Decrementing unreadCount from', chat.unreadCount, 'to', newUnreadCount);
              
              await chat.update({
                unreadCount: newUnreadCount
              });
            }
          }
        } catch (error) {
          console.error('Error in afterUpdate hook:', error);
        }
      }
    }
  }
);


module.exports = MaxMessage;
