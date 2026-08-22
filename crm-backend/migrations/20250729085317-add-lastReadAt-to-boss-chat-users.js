'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (qi, Sequelize) => {
    await qi.addColumn('boss_chat_users', 'lastReadAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // (опционально) если больше не нужен lastReadMessageId:
    await qi.removeColumn('boss_chat_users', 'lastReadMessageId');
  },
  down: async (qi, Sequelize) => {
    await qi.addColumn('boss_chat_users', 'lastReadMessageId', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await qi.removeColumn('boss_chat_users', 'lastReadAt');
  }
};
