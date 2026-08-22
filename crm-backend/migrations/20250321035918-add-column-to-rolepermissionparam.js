'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("role_permission_params", "canEdit", {
      type: Sequelize.BOOLEAN,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("role_permission_params", "canEdit");
  },
};
