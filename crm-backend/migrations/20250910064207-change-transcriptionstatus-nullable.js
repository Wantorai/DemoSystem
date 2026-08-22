'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Убираем дефолт и разрешаем null
    await queryInterface.changeColumn('RoomMessages', 'transcriptionStatus', {
      type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Возвращаем предыдущую схему (если её помнишь)
    await queryInterface.changeColumn('RoomMessages', 'transcriptionStatus', {
      type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    });
  }
};