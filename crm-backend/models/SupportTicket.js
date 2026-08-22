const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const SupportTicket = sequelize.define('SupportTicket', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  creatorUserId: { type: DataTypes.INTEGER, allowNull: false },
  creatorKey: { type: DataTypes.STRING(180), allowNull: false },
  creatorName: { type: DataTypes.STRING, allowNull: false },
  source: { type: DataTypes.STRING, allowNull: false, defaultValue: 'web' },
  title: { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM('new', 'in_progress', 'done'),
    allowNull: false,
    defaultValue: 'new',
  },
  attachmentUrl: { type: DataTypes.STRING, allowNull: true },
  attachmentName: { type: DataTypes.STRING, allowNull: true },
  attachmentType: { type: DataTypes.STRING, allowNull: true },
  technicalInfo: { type: DataTypes.JSONB, allowNull: true },
  adminViewedAt: { type: DataTypes.DATE, allowNull: true },
  adminComment: { type: DataTypes.TEXT, allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'SupportTickets',
  timestamps: true,
  indexes: [
    { fields: ['creatorUserId'] },
    { fields: ['creatorKey'] },
    { fields: ['status'] },
    { fields: ['createdAt'] },
  ],
});

module.exports = SupportTicket;
