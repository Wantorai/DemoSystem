'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employees', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      fullNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      employeeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      telegramId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('employees');
  },
};
