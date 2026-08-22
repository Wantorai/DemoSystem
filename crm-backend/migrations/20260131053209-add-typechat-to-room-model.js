'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем поле senderName
    await queryInterface.addColumn('Rooms', 'type', {
      type: Sequelize.STRING,
      allowNull: false, 
      defaultValue: 'group',

    });

  },

  async down(queryInterface, Sequelize) {
    // Удаляем добавленные поля при откате миграции
    await queryInterface.removeColumn('Rooms', 'type');
  }
};
