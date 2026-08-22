'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('records', 'telegramId', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Telegram ID сотрудника для напоминаний'
    });
    await queryInterface.addColumn('records', 'reminderSent', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг: напоминание уже отправлено'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('records', 'reminderSent');
    await queryInterface.removeColumn('records', 'telegramId');
  }
};
