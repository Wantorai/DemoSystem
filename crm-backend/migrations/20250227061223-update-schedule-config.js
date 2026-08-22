'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('schedule_config', 'schedule_config', {
      type: Sequelize.JSONB, // Обновляем JSONB, чтобы он соответствовал локальному формату
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('schedule_config', 'schedule_config', {
      type: Sequelize.JSONB,
      allowNull: false,
    });
  }
};

