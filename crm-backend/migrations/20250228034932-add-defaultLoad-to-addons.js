'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('addons', 'defaultLoad', {
      type: Sequelize.BOOLEAN,
      defaultValue: false, // Значение по умолчанию false
      allowNull: false, // Убедитесь, что это поле не может быть null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('addons', 'defaultLoad');
  }
};
