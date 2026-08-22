'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reminders', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      creatorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      sourceKind: {
        type: Sequelize.ENUM('room', 'boss', 'manual'),
        allowNull: false,
        defaultValue: 'manual',
      },
      sourceRoomId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Rooms', key: 'id' },
        onDelete: 'SET NULL',
      },
      sourceChatId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'boss_chats', key: 'id' },
        onDelete: 'SET NULL',
      },
      targetKind: {
        type: Sequelize.ENUM('users', 'boss', 'group'),
        allowNull: false,
      },
      targetIdsJson: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      scheduledFor: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      nextRunAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      recurrenceKind: {
        type: Sequelize.ENUM('none', 'daily', 'weekly', 'interval', 'monthly_day'),
        allowNull: false,
        defaultValue: 'none',
      },
      recurrenceMinutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      recurrenceDayOfMonth: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      isPaused: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      lastSentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastError: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex('reminders', ['creatorUserId'], {
      name: 'idx_reminders_creator_user_id',
    });
    await queryInterface.addIndex('reminders', ['isActive', 'isPaused', 'nextRunAt'], {
      name: 'idx_reminders_active_paused_next_run',
    });
    await queryInterface.addIndex('reminders', ['sourceRoomId'], {
      name: 'idx_reminders_source_room_id',
    });
    await queryInterface.addIndex('reminders', ['sourceChatId'], {
      name: 'idx_reminders_source_chat_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('reminders', 'idx_reminders_creator_user_id');
    await queryInterface.removeIndex('reminders', 'idx_reminders_active_paused_next_run');
    await queryInterface.removeIndex('reminders', 'idx_reminders_source_room_id');
    await queryInterface.removeIndex('reminders', 'idx_reminders_source_chat_id');
    await queryInterface.dropTable('reminders');

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reminders_sourceKind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reminders_targetKind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reminders_recurrenceKind";');
  },
};
