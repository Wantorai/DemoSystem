'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addIndex('boss_pinned_messages', ['chatId', 'messageId'], {
      name: 'boss_pinned_unique_chat_message',
      unique: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('boss_pinned_messages', 'boss_pinned_unique_chat_message');
  }
};