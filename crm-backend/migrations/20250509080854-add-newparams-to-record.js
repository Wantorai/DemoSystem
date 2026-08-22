'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('records', 'newParams', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},   // чтобы сразу был объект, а не null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('records', 'newParams');
  }
};