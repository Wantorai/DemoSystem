'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) Добавляем колонку
    await queryInterface.addColumn('boss_chat_users', 'lastReadMessageId', {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: true,
    });


  },

  async down(queryInterface /* Sequelize */) {
    // Удаляем колонку при откате
    await queryInterface.removeColumn('boss_chat_users', 'lastReadMessageId');
  }
};