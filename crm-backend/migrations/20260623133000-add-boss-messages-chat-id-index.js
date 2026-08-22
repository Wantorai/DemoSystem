'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('boss_messages', ['chatId', 'id'], {
      name: 'idx_boss_messages_chat_id_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('boss_messages', 'idx_boss_messages_chat_id_id');
  },
};
