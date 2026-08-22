const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const CrossCompanyChatRequest = sequelize.define(
  'CrossCompanyChatRequest',
  {
    requesterUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    requesterName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    requesterPhone: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    requesterDomain: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    targetDomain: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    targetPhone: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    targetUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    targetUserName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    direction: {
      type: DataTypes.ENUM('outbound', 'inbound'),
      allowNull: false,
      defaultValue: 'outbound',
    },
    decisionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    decidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    chatArchivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    externalRequestId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bridgeMeta: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: 'cross_company_chat_requests',
  }
);

module.exports = CrossCompanyChatRequest;
