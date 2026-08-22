'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("simple_events", "start", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW() AT TIME ZONE 'UTC'"),
    });

    await queryInterface.changeColumn("simple_events", "end", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.literal("NOW() AT TIME ZONE 'UTC'"), // Если нужно
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("simple_events", "start", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal("NOW()"), // Вернем к локальному времени БД
    });

    await queryInterface.changeColumn("simple_events", "end", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null, // Вернем как было
    });
  },
};
