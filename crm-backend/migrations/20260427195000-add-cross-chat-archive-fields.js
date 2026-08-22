'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('cross_company_chat_requests', 'chatArchivedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('cross_company_chat_requests', ['roomId', 'status'], {
      name: 'idx_cross_chat_room_status',
    });
  },

  down: async (queryInterface) => {
    try {
      await queryInterface.removeIndex('cross_company_chat_requests', 'idx_cross_chat_room_status');
    } catch (_) {}
    await queryInterface.removeColumn('cross_company_chat_requests', 'chatArchivedAt');
  },
};

