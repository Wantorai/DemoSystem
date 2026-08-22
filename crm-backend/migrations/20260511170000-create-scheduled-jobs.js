'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scheduled_jobs', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      command: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      minute: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hour: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      daysOfWeek: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: '*',
      },
      isEnabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      timezone: {
        type: Sequelize.STRING(64),
        allowNull: false,
        defaultValue: 'Europe/Moscow',
      },
      lastRunAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastSuccessAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      lastStatus: {
        type: Sequelize.ENUM('idle', 'running', 'success', 'failed'),
        allowNull: false,
        defaultValue: 'idle',
      },
      lastMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      lastDurationMs: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      nextRunAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('scheduled_jobs', ['code'], {
      unique: true,
      name: 'scheduled_jobs_code_unique',
    });
    await queryInterface.addIndex('scheduled_jobs', ['isEnabled', 'nextRunAt'], {
      name: 'scheduled_jobs_enabled_nextrun_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('scheduled_jobs', 'scheduled_jobs_enabled_nextrun_idx').catch(() => {});
    await queryInterface.removeIndex('scheduled_jobs', 'scheduled_jobs_code_unique').catch(() => {});
    await queryInterface.dropTable('scheduled_jobs');

    // Для PostgreSQL нужно удалить enum вручную
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_scheduled_jobs_lastStatus";').catch(() => {});
  },
};
