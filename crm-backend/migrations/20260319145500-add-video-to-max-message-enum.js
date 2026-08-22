'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE t.typname = 'enum_max_messages_messageType'
            AND e.enumlabel = 'video'
        ) THEN
          ALTER TYPE "enum_max_messages_messageType" ADD VALUE 'video';
        END IF;
      END
      $$;
    `);
  },

  async down() {
    // PostgreSQL не поддерживает удаление enum value без пересоздания типа.
  },
};

