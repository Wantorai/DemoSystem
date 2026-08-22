'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'canWhatsApp', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Доступ к WhatsApp чатам',
    });

    await queryInterface.createTable('whatsapp_chats', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      whatsappChatId: { type: Sequelize.STRING, allowNull: false },
      botType: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'business' },
      whatsappUserId: { type: Sequelize.STRING, allowNull: true },
      username: { type: Sequelize.STRING, allowNull: true },
      unreadCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lastMessageText: { type: Sequelize.TEXT, allowNull: true },
      lastMessageTime: { type: Sequelize.DATE, allowNull: true },
      assigneeId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      participantIds: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      isClosed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      archivedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('whatsapp_messages', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      wChatId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'whatsapp_chats', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      whatsappMessageId: { type: Sequelize.STRING, allowNull: false },
      text: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      fromMe: { type: Sequelize.BOOLEAN, allowNull: false },
      attachments: { type: Sequelize.JSONB, allowNull: true },
      messageType: {
        type: Sequelize.ENUM('text', 'audio', 'image', 'video', 'document'),
        allowNull: false,
        defaultValue: 'text',
      },
      isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      senderName: { type: Sequelize.STRING, allowNull: true },
      senderId: { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('whatsapp_messages', ['wChatId', 'whatsappMessageId'], {
      unique: true,
      name: 'whatsapp_messages_chat_message_unique',
    });
    await queryInterface.addIndex('whatsapp_chats', ['botType', 'whatsappChatId'], {
      unique: true,
      name: 'whatsapp_chats_bot_type_chat_id_unique',
    });
    await queryInterface.addIndex('whatsapp_chats', ['botType', 'assigneeId'], {
      name: 'whatsapp_chats_bot_type_assignee_idx',
    });
    await queryInterface.addIndex('whatsapp_chats', ['archivedAt'], {
      name: 'whatsapp_chats_archived_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('whatsapp_messages');
    await queryInterface.dropTable('whatsapp_chats');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_whatsapp_messages_messageType";');
    await queryInterface.removeColumn('users', 'canWhatsApp');
  },
};

