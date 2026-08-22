'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'canTelegram', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Доступ к Telegram чатам',
    });

    await queryInterface.createTable('telegram_chats', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      telegramChatId: { type: Sequelize.STRING, allowNull: false, unique: true },
      telegramUserId: { type: Sequelize.STRING, allowNull: true },
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

    await queryInterface.createTable('telegram_messages', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      tChatId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'telegram_chats', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      telegramMessageId: { type: Sequelize.STRING, allowNull: false },
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

    await queryInterface.addIndex('telegram_messages', ['tChatId', 'telegramMessageId'], {
      unique: true,
      name: 'telegram_messages_chat_message_unique',
    });
    await queryInterface.addIndex('telegram_chats', ['archivedAt'], {
      name: 'telegram_chats_archived_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('telegram_messages');
    await queryInterface.dropTable('telegram_chats');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_telegram_messages_messageType";');
    await queryInterface.removeColumn('users', 'canTelegram');
  },
};
