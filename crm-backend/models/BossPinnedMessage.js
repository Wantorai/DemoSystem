// models/BossPinnedMessage.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const BossPinnedMessage = sequelize.define('BossPinnedMessage', {
  chatId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'boss_chats', key: 'id' },
    onDelete: 'CASCADE',
  },
  messageId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'boss_messages', key: 'id' },
    onDelete: 'CASCADE',
  },
  pinnedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  },
  pinnedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'boss_pinned_messages',
  timestamps: false,
    indexes: [
    { unique: true, fields: ['chatId', 'messageId'], name: 'boss_pinned_unique_chat_message' }
  ]
});

BossPinnedMessage.associate = (models) => {
  BossPinnedMessage.belongsTo(models.BossChat, { foreignKey: 'chatId' });
  BossPinnedMessage.belongsTo(models.BossMessage, { foreignKey: 'messageId', as: 'message' });
  BossPinnedMessage.belongsTo(models.User, { foreignKey: 'pinnedByUserId', as: 'pinnedBy' });
};

module.exports = BossPinnedMessage;
