'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("permissions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      resource: { type: Sequelize.STRING, unique: true, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("permissions");
  },
};
