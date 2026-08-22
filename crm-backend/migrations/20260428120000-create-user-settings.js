'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "user_settings" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
        "key" VARCHAR(120) NOT NULL,
        "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "user_settings_user_id_idx"
      ON "user_settings" ("userId");
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_user_key_unique"
      ON "user_settings" ("userId", "key");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "user_settings_user_key_unique";
    `);
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "user_settings_user_id_idx";
    `);
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS "user_settings";
    `);
  },
};
