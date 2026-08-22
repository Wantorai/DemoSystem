const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Reminder = sequelize.define(
  'Reminder',
  {
    creatorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sourceKind: {
      type: DataTypes.ENUM('room', 'boss', 'manual'),
      allowNull: false,
      defaultValue: 'manual',
    },
    sourceRoomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    sourceChatId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    targetKind: {
      type: DataTypes.ENUM('users', 'boss', 'group'),
      allowNull: false,
    },
    targetIdsJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    recurrenceKind: {
      type: DataTypes.ENUM('none', 'daily', 'weekly', 'interval', 'monthly_day'),
      allowNull: false,
      defaultValue: 'none',
    },
    recurrenceMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    recurrenceDayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isPaused: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'reminders',
    timestamps: true,
    indexes: [
      { fields: ['creatorUserId'] },
      { fields: ['isActive', 'isPaused', 'nextRunAt'] },
    ],
  }
);

Reminder.associate = (models) => {
  Reminder.belongsTo(models.User, { foreignKey: 'creatorUserId' });
};

module.exports = Reminder;
