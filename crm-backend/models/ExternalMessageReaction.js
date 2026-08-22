const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const ExternalMessageReaction = sequelize.define('ExternalMessageReaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  channel: { type: DataTypes.STRING(16), allowNull: false },
  messageId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  emoji: { type: DataTypes.STRING(32), allowNull: false },
}, {
  tableName: 'external_message_reactions',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['channel', 'messageId', 'userId'], name: 'external_message_reactions_channel_message_user_unique' },
    { fields: ['channel', 'messageId'], name: 'external_message_reactions_channel_message' },
  ],
});

module.exports = ExternalMessageReaction;
