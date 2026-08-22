'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('RoomMessages', 'transcriptionText', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'transcriptionStatus', {
      type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addColumn('RoomMessages', 'transcriptionProvider', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'transcriptionConfidence', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'transcriptionError', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'transcribedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('RoomMessages', 'transcribedAt');
    await queryInterface.removeColumn('RoomMessages', 'transcriptionError');
    await queryInterface.removeColumn('RoomMessages', 'transcriptionConfidence');
    await queryInterface.removeColumn('RoomMessages', 'transcriptionProvider');
    await queryInterface.removeColumn('RoomMessages', 'transcriptionStatus');
    await queryInterface.removeColumn('RoomMessages', 'transcriptionText');
    // drop enum type (Postgres)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_RoomMessages_transcriptionStatus";');
  }
};
