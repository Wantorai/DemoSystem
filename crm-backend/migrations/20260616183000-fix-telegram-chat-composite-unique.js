'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        item record;
      BEGIN
        FOR item IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'telegram_chats'::regclass
            AND contype = 'u'
            AND (
              SELECT array_agg(att.attname ORDER BY att.attnum)
              FROM unnest(conkey) AS key(attnum)
              JOIN pg_attribute att
                ON att.attrelid = conrelid
               AND att.attnum = key.attnum
            ) = ARRAY['telegramChatId']::name[]
        LOOP
          EXECUTE format('ALTER TABLE "telegram_chats" DROP CONSTRAINT %I', item.conname);
        END LOOP;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "telegram_chats_telegram_chat_id_unique";
      DROP INDEX IF EXISTS "telegram_chats_telegramChatId_key";
      DROP INDEX IF EXISTS "telegram_chats_telegram_chat_id_idx";
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "telegram_chats_bot_type_chat_id_unique"
      ON "telegram_chats" ("botType", "telegramChatId");
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "telegram_chats_bot_type_chat_id_unique";
    `);

    await queryInterface.addIndex('telegram_chats', ['telegramChatId'], {
      unique: true,
      name: 'telegram_chats_telegram_chat_id_unique',
    });
  },
};
