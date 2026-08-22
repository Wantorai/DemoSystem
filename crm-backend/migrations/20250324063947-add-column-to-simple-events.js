'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("simple_events", "type", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "simple", 
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("simple_events", "type");
  },
};
