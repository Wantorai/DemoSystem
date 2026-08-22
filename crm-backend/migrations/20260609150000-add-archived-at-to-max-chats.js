'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('max_chats', 'archivedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('max_chats', ['archivedAt'], {
      name: 'max_chats_archived_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('max_chats', 'max_chats_archived_at_idx');
    await queryInterface.removeColumn('max_chats', 'archivedAt');
  },
};
