'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alert_notices', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      creatorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },

      title: { type: Sequelize.STRING(255), allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: false },

      targetKind: {
        type: Sequelize.ENUM('users', 'boss', 'group'),
        allowNull: false,
        defaultValue: 'users',
      },

      targetIdsJson: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('alert_notices', ['creatorUserId'], {
      name: 'idx_alert_notices_creator_user_id',
    });

    await queryInterface.addIndex('alert_notices', ['isActive', 'createdAt'], {
      name: 'idx_alert_notices_active_created_at',
    });

    await queryInterface.createTable('alert_notice_recipients', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },

      alertId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'alert_notices', key: 'id' },
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

      readAt: { type: Sequelize.DATE, allowNull: true },

      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('alert_notice_recipients', ['alertId', 'userId'], {
      unique: true,
      name: 'idx_alert_notice_recipients_alert_user_unique',
    });

    await queryInterface.addIndex('alert_notice_recipients', ['userId', 'readAt'], {
      name: 'idx_alert_notice_recipients_user_read_at',
    });

    await queryInterface.addIndex('alert_notice_recipients', ['alertId'], {
      name: 'idx_alert_notice_recipients_alert_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('alert_notice_recipients');
    await queryInterface.dropTable('alert_notices');

    // Для Postgres enum остаётся отдельно
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_alert_notices_targetKind";');
  },
};
