'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('room_message_reactions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'RoomMessages', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      emoji: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('room_message_reactions', ['messageId', 'userId'], {
      unique: true,
      name: 'idx_room_reactions_message_user_unique',
    });
    await queryInterface.addIndex('room_message_reactions', ['messageId'], {
      name: 'idx_room_reactions_message_id',
    });
    await queryInterface.addIndex('room_message_reactions', ['userId'], {
      name: 'idx_room_reactions_user_id',
    });

    await queryInterface.createTable('boss_message_reactions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'boss_messages', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      emoji: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('boss_message_reactions', ['messageId', 'userId'], {
      unique: true,
      name: 'idx_boss_reactions_message_user_unique',
    });
    await queryInterface.addIndex('boss_message_reactions', ['messageId'], {
      name: 'idx_boss_reactions_message_id',
    });
    await queryInterface.addIndex('boss_message_reactions', ['userId'], {
      name: 'idx_boss_reactions_user_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('boss_message_reactions');
    await queryInterface.dropTable('room_message_reactions');
  },
};
