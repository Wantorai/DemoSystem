'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('crm_configs', 'value', {
      type: Sequelize.TEXT,       // или STRING, если достаточно
      allowNull: false,
      defaultValue: '',           // чтобы старые записи получили пустую строку
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('crm_configs', 'value');
  }
};
