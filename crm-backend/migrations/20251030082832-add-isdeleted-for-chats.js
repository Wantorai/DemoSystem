'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {

    await queryInterface.addColumn('RoomMessages', 'is_deleted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('RoomMessages', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'deleted_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Boss messages table - у тебя tableName = 'boss_messages'
    await queryInterface.addColumn('boss_messages', 'is_deleted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('boss_messages', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('boss_messages', 'deleted_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('RoomMessages', 'is_deleted');
    await queryInterface.removeColumn('RoomMessages', 'deleted_at');
    await queryInterface.removeColumn('RoomMessages', 'deleted_by');

    await queryInterface.removeColumn('boss_messages', 'is_deleted');
    await queryInterface.removeColumn('boss_messages', 'deleted_at');
    await queryInterface.removeColumn('boss_messages', 'deleted_by');
  }
};