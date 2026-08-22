'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('config', 'width', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('config', 'newLabel', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('config', 'active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('config', 'width');
    await queryInterface.removeColumn('config', 'newLabel');
    await queryInterface.removeColumn('config', 'active');
  }
};
