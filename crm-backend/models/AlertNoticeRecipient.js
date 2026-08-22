const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const AlertNoticeRecipient = sequelize.define(
  'AlertNoticeRecipient',
  {
    alertId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'alert_notice_recipients',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['alertId', 'userId'] },
      { fields: ['userId', 'readAt'] },
      { fields: ['alertId'] },
    ],
  }
);

module.exports = AlertNoticeRecipient;

