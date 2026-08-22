const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ScheduledJobRun = sequelize.define(
  'ScheduledJobRun',
  {
    jobId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('running', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'running',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    output: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    exitCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'scheduled_job_runs',
    timestamps: true,
    indexes: [
      { fields: ['jobId', 'startedAt'] },
      { fields: ['status'] },
    ],
  }
);

ScheduledJobRun.associate = (models) => {
  ScheduledJobRun.belongsTo(models.ScheduledJob, {
    foreignKey: 'jobId',
    as: 'job',
  });
};

module.exports = ScheduledJobRun;
