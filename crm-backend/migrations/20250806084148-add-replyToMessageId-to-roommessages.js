'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('RoomMessages', 'replyToMessageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'RoomMessages',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('RoomMessages', 'replyToMessageId');
  },
};
