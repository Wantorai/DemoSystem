'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('role_permission_params', 'allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('role_permission_params', 'allowed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true, // Восстанавливаем defaultValue при откате
    });
  }
};
