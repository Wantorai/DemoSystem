'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('config_links', 'style', {
      type: Sequelize.STRING,
      defaultValue: "", // Значение по умолчанию 
      allowNull: false, // Убедитесь, что это поле не может быть null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('config_links', 'style');
  }
};
