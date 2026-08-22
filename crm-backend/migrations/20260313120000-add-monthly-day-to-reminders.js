'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_reminders_recurrenceKind" ADD VALUE IF NOT EXISTS 'monthly_day';`
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrenceDayOfMonth" INTEGER;`
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "reminders" DROP COLUMN IF EXISTS "recurrenceDayOfMonth";`
    );
  },
};

