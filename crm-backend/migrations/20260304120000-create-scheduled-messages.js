'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scheduled_messages', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      kind: {
        type: Sequelize.ENUM('room', 'boss'),
        allowNull: false,
      },
      roomId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      chatId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      replyToMessageId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      scheduledFor: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      scheduleState: {
        type: Sequelize.ENUM('pending', 'sending', 'sent', 'cancelled', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancelledAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastError: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sentMessageId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      clientId: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
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

    await queryInterface.sequelize.query(`
      ALTER TABLE scheduled_messages
      ADD CONSTRAINT scheduled_messages_target_check
      CHECK (
        (kind = 'room' AND "roomId" IS NOT NULL AND "chatId" IS NULL) OR
        (kind = 'boss' AND "chatId" IS NOT NULL AND "roomId" IS NULL)
      );
    `);

    await queryInterface.addIndex('scheduled_messages', ['scheduleState', 'scheduledFor'], {
      name: 'idx_scheduled_messages_state_time',
    });
    await queryInterface.addIndex('scheduled_messages', ['roomId'], {
      name: 'idx_scheduled_messages_room_id',
    });
    await queryInterface.addIndex('scheduled_messages', ['chatId'], {
      name: 'idx_scheduled_messages_chat_id',
    });
    await queryInterface.addIndex('scheduled_messages', ['userId'], {
      name: 'idx_scheduled_messages_user_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('scheduled_messages', 'idx_scheduled_messages_state_time');
    await queryInterface.removeIndex('scheduled_messages', 'idx_scheduled_messages_room_id');
    await queryInterface.removeIndex('scheduled_messages', 'idx_scheduled_messages_chat_id');
    await queryInterface.removeIndex('scheduled_messages', 'idx_scheduled_messages_user_id');
    await queryInterface.removeConstraint('scheduled_messages', 'scheduled_messages_target_check');
    await queryInterface.dropTable('scheduled_messages');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_scheduled_messages_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_scheduled_messages_scheduleState";');
  },
};
