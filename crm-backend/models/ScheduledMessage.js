const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ScheduledMessage = sequelize.define(
  'ScheduledMessage',
  {
    kind: {
      type: DataTypes.ENUM('room', 'boss'),
      allowNull: false,
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    chatId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    replyToMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    scheduleState: {
      type: DataTypes.ENUM('pending', 'sending', 'sent', 'cancelled', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sentMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    clientId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
  },
  {
    tableName: 'scheduled_messages',
    timestamps: true,
  }
);

ScheduledMessage.associate = (models) => {
  ScheduledMessage.belongsTo(models.User, {
    foreignKey: 'userId',
    onDelete: 'CASCADE',
  });
};

module.exports = ScheduledMessage;

