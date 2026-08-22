'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        user_row RECORD;
        self_room_id INTEGER;
      BEGIN
        FOR user_row IN
          SELECT u.id
          FROM users u
          WHERE COALESCE(u.system, FALSE) = FALSE
            AND COALESCE(u."autoCreatePersonalChats", TRUE) = TRUE
            AND NOT EXISTS (
              SELECT 1
              FROM "Rooms" r
              JOIN "RoomUsers" ru ON ru."roomId" = r.id
              WHERE r.name = 'Отправка себе'
                AND r.type = 'personal'
                AND ru."userId" = u.id
                AND (
                  SELECT COUNT(*)
                  FROM "RoomUsers" room_members
                  WHERE room_members."roomId" = r.id
                ) = 1
            )
        LOOP
          INSERT INTO "Rooms" (name, type, "createdAt", "updatedAt")
          VALUES ('Отправка себе', 'personal', NOW(), NOW())
          RETURNING id INTO self_room_id;

          INSERT INTO "RoomUsers" ("roomId", "userId")
          VALUES (self_room_id, user_row.id);
        END LOOP;
      END
      $$;
    `);
  },

  async down() {
    // Data backfill is intentionally not removed: self rooms may contain user messages.
  },
};
