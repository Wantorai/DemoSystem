'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('RoomMessages', 'externalAuthorKind', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'externalAuthorName', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'externalAuthorId', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addIndex('RoomMessages', ['externalAuthorKind', 'externalAuthorId'], {
      name: 'idx_room_messages_external_author',
    }).catch(() => {});
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('RoomMessages', 'idx_room_messages_external_author').catch(() => {});
    await queryInterface.removeColumn('RoomMessages', 'externalAuthorId').catch(() => {});
    await queryInterface.removeColumn('RoomMessages', 'externalAuthorName').catch(() => {});
    await queryInterface.removeColumn('RoomMessages', 'externalAuthorKind').catch(() => {});
  }
};
