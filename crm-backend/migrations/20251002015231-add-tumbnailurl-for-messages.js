'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // добавляем столбцы
    await queryInterface.addColumn('boss_messages', 'thumbnailUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('chat_messages', 'thumbnailUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('RoomMessages', 'thumbnailUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Если реальные таблицы называются по-другому, замените имена выше.
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('BossMessage', 'thumbnailUrl');
    await queryInterface.removeColumn('ChatMessage', 'thumbnailUrl');
    await queryInterface.removeColumn('RoomMessage', 'thumbnailUrl');
  }
};
