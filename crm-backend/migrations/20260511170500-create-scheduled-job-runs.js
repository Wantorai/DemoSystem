'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scheduled_job_runs', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      jobId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'scheduled_jobs',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      finishedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('running', 'success', 'failed'),
        allowNull: false,
        defaultValue: 'running',
      },
      durationMs: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      output: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      exitCode: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('scheduled_job_runs', ['jobId', 'startedAt'], {
      name: 'scheduled_job_runs_jobid_startedat_idx',
    });
    await queryInterface.addIndex('scheduled_job_runs', ['status'], {
      name: 'scheduled_job_runs_status_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('scheduled_job_runs', 'scheduled_job_runs_status_idx').catch(() => {});
    await queryInterface.removeIndex('scheduled_job_runs', 'scheduled_job_runs_jobid_startedat_idx').catch(() => {});
    await queryInterface.dropTable('scheduled_job_runs');

    // Для PostgreSQL нужно удалить enum вручную
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_scheduled_job_runs_status";').catch(() => {});
  },
};
