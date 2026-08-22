'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn('permissions', 'label', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: '' // Устанавливаем пустую строку, чтобы не было ошибок при существующих данных
    });
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn('permissions', 'label');
  }
};
