'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // добавляем поле fileSize (байты) в таблицу RoomMessages
    await queryInterface.addColumn('RoomMessages', 'fileSize', {
      type: Sequelize.BIGINT,
      allowNull: true,
      defaultValue: null,
      comment: 'File size in bytes (nullable)',
    });

    // добавляем поле fileSize в таблицу boss_messages
    await queryInterface.addColumn('boss_messages', 'fileSize', {
      type: Sequelize.BIGINT,
      allowNull: true,
      defaultValue: null,
      comment: 'File size in bytes (nullable)',
    });
  },

  down: async (queryInterface /* , Sequelize */) => {
    // откат: удаляем колонки
    await queryInterface.removeColumn('RoomMessages', 'fileSize');
    await queryInterface.removeColumn('boss_messages', 'fileSize');
  }
};
