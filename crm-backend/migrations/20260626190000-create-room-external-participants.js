'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('room_external_participants', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      roomId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Rooms', key: 'id' },
        onDelete: 'CASCADE',
      },
      kind: {
        type: Sequelize.ENUM('telegram', 'max'),
        allowNull: false,
      },
      externalChatId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      externalUserId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      displayName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      invitedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      },
      linkedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
    await queryInterface.addConstraint('room_external_participants', {
      fields: ['roomId', 'kind', 'externalChatId'],
      type: 'unique',
      name: 'room_external_participants_room_kind_chat_unique',
    });
    await queryInterface.addIndex('room_external_participants', ['kind', 'externalChatId'], {
      name: 'room_external_participants_kind_chat_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('room_external_participants');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_room_external_participants_kind";');
  },
};
