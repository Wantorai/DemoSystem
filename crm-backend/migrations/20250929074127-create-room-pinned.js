'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('room_pinned_messages', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      roomId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Rooms',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'RoomMessages',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      pinnedByUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      pinnedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      orderIndex: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });

    // уникальный индекс (roomId + messageId)
    await queryInterface.addIndex('room_pinned_messages', ['roomId', 'messageId'], {
      unique: true,
      name: 'room_pinned_unique_chat_message',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('room_pinned_messages');
  },
};