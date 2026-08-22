const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ScheduledJob = sequelize.define(
  'ScheduledJob',
  {
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    command: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    minute: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    hour: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    daysOfWeek: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: '*',
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'Europe/Moscow',
    },
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSuccessAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastStatus: {
      type: DataTypes.ENUM('idle', 'running', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'idle',
    },
    lastMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastDurationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    retentionDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'scheduled_jobs',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['isEnabled', 'nextRunAt'] },
    ],
  }
);

ScheduledJob.associate = (models) => {
  ScheduledJob.hasMany(models.ScheduledJobRun, {
    foreignKey: 'jobId',
    as: 'runs',
  });
};

module.exports = ScheduledJob;
