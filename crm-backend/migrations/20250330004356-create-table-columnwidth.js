'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('column_width', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      columnName: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      width: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 100
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('column_width');
  }
};
