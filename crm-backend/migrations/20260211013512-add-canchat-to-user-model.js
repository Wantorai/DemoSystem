'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'canChat', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Разрешение на создание личных чатов'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'canChat');
  }
};