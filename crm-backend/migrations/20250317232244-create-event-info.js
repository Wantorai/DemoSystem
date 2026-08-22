'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('event_infos', {
      paramId: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      paramName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      paramLabel: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      allowed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('event_infos');
  }
};

