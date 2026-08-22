const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const UnifiedPushSubscription = sequelize.define(
  'UnifiedPushSubscription',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    endpoint: { type: DataTypes.TEXT, allowNull: false },
    p256dh: { type: DataTypes.STRING(255), allowNull: false },
    auth: { type: DataTypes.STRING(255), allowNull: false },
    instance: { type: DataTypes.STRING(128), allowNull: true },
    distributorId: { type: DataTypes.STRING(255), allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'unified_push_subscriptions',
    timestamps: false,
    indexes: [{ fields: ['userId'] }, { fields: ['instance'] }],
  }
);

module.exports = UnifiedPushSubscription;

