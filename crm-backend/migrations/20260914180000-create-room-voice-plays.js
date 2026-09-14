'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('room_voice_tracking_start', {
        id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
        startedAt: { type: Sequelize.DATE, allowNull: false },
      }, { transaction });
      await queryInterface.sequelize.query('INSERT INTO room_voice_tracking_start (id, "startedAt") VALUES (1, NOW())', { transaction });
      await queryInterface.createTable('room_voice_plays', {
        userId: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        messageId: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: 'RoomMessages', key: 'id' }, onDelete: 'CASCADE' },
        playedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction });
      await queryInterface.sequelize.query(`CREATE INDEX room_messages_voice_room_id ON "RoomMessages" ("roomId", "createdAt", id DESC)
        WHERE type = 'audio' AND "mediaUrl" IS NOT NULL`, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('RoomMessages', 'room_messages_voice_room_id', { transaction });
      await queryInterface.dropTable('room_voice_plays', { transaction });
      await queryInterface.dropTable('room_voice_tracking_start', { transaction });
    });
  },
};
