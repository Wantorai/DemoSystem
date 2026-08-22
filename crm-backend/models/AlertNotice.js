const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const AlertNotice = sequelize.define(
  'AlertNotice',
  {
    creatorUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    targetKind: {
      type: DataTypes.ENUM('users', 'boss', 'group'),
      allowNull: false,
      defaultValue: 'users',
    },
    targetIdsJson: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    scheduledFor: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'alert_notices',
    timestamps: true,
    indexes: [
      { fields: ['creatorUserId'] },
      { fields: ['isActive', 'createdAt'] },
      { fields: ['isActive', 'publishedAt'] },
      { fields: ['isActive', 'scheduledFor'] },
    ],
  }
);

module.exports = AlertNotice;
