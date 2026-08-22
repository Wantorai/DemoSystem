'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('boss_pinned_messages', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      chatId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'boss_chats', key: 'id' },
        onDelete: 'CASCADE',
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'boss_messages', key: 'id' },
        onDelete: 'CASCADE',
      },
      pinnedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      pinnedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      expiresAt: { type: Sequelize.DATE, allowNull: true },
      orderIndex: { type: Sequelize.INTEGER, allowNull: true },
    });

    await queryInterface.addIndex('boss_pinned_messages', ['chatId', 'pinnedAt']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('boss_pinned_messages');
  },
};
