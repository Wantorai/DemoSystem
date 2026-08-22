// models/RoomPinnedMessage.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RoomPinnedMessage = sequelize.define('RoomPinnedMessage', {
  roomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "Rooms", key: 'id' },
    onDelete: 'CASCADE',
  },
  messageId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "RoomMessages", key: 'id' },
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
  tableName: 'room_pinned_messages',
  timestamps: false,
    indexes: [
    { unique: true, fields: ['roomId', 'messageId'], name: 'room_pinned_unique_chat_message' }
  ]
});

RoomPinnedMessage.associate = (models) => {
  RoomPinnedMessage.belongsTo(models.Room, { foreignKey: 'roomId' });
  RoomPinnedMessage.belongsTo(models.RoomMessage, { foreignKey: 'messageId', as: 'message' });
  RoomPinnedMessage.belongsTo(models.User, { foreignKey: 'pinnedByUserId', as: 'pinnedBy' });
};

module.exports = RoomPinnedMessage;
