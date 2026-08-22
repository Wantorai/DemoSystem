'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('role_permission_params', {
      roleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      permissionParamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      allowed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('role_permission_params');
  }
};
