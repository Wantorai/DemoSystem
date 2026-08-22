'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("order_statuses", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false },
      key: { type: Sequelize.STRING, allowNull: false, unique: true },
      defaultValue: { type: Sequelize.STRING, defaultValue: "" },
      isActive: { type: Sequelize.BOOLEAN, defaultValue: false },
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("order_statuses");
  },
};
