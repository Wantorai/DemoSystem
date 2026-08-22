'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('RoomUsers', 'lastReadMessageId', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    await queryInterface.changeColumn('boss_chat_users', 'lastReadMessageId', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('RoomUsers', 'lastReadMessageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn('boss_chat_users', 'lastReadMessageId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};
