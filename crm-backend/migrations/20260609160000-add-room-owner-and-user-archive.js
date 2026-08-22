'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Rooms', 'creatorUserId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('RoomUsers', 'archivedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Rooms" AS room
      SET "creatorUserId" = COALESCE(
        (
          SELECT message."userId"
          FROM "RoomMessages" AS message
          WHERE message."roomId" = room.id
            AND EXISTS (
              SELECT 1
              FROM "RoomUsers" AS member
              WHERE member."roomId" = room.id
                AND member."userId" = message."userId"
            )
          ORDER BY message.id ASC
          LIMIT 1
        ),
        (
          SELECT MIN(member."userId")
          FROM "RoomUsers" AS member
          WHERE member."roomId" = room.id
        )
      )
      WHERE room."creatorUserId" IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('RoomUsers', 'archivedAt');
    await queryInterface.removeColumn('Rooms', 'creatorUserId');
  },
};
