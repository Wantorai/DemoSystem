'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('dashboard_configs', 'color', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: '#3182ce',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('dashboard_configs', 'color');
  }
};
