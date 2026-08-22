'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // добавляем столбцы
    await queryInterface.addColumn('boss_messages', 'duration', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('chat_messages', 'duration', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('RoomMessages', 'duration', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Если реальные таблицы называются по-другому, замените имена выше.
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('BossMessage', 'duration');
    await queryInterface.removeColumn('ChatMessage', 'duration');
    await queryInterface.removeColumn('RoomMessage', 'duration');
  }
};
