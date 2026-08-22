'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('boss_messages', 'replyToMessageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'boss_messages',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('boss_messages', 'replyToMessageId');
  },
};
