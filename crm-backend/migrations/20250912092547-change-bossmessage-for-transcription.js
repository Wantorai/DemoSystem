'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('boss_messages', 'transcriptionText', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('boss_messages', 'transcriptionStatus', {
      type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('boss_messages', 'transcriptionProvider', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('boss_messages', 'transcriptionConfidence', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('boss_messages', 'transcriptionError', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('boss_messages', 'transcribedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('boss_messages', 'transcribedAt');
    await queryInterface.removeColumn('boss_messages', 'transcriptionError');
    await queryInterface.removeColumn('boss_messages', 'transcriptionConfidence');
    await queryInterface.removeColumn('boss_messages', 'transcriptionProvider');
    await queryInterface.removeColumn('boss_messages', 'transcriptionStatus');
    await queryInterface.removeColumn('boss_messages', 'transcriptionText');
    // drop enum type (Postgres)
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_RoomMessages_transcriptionStatus";');
  }
};