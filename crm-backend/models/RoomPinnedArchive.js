const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RoomPinnedArchive = sequelize.define('RoomPinnedArchive', {
  roomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Rooms', key: 'id' },
    onDelete: 'CASCADE',
  },
  messageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'RoomMessages', key: 'id' },
    onDelete: 'SET NULL',
  },
  pinnedId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  unpinnedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  archivedUntil: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'room_pinned_archives',
  timestamps: false,
  indexes: [
    { fields: ['userId', 'archivedUntil'], name: 'idx_room_pinned_archives_user_ttl' },
    { fields: ['roomId', 'unpinnedAt'], name: 'idx_room_pinned_archives_room_unpinned' },
  ],
});

RoomPinnedArchive.associate = (models) => {
  RoomPinnedArchive.belongsTo(models.Room, { foreignKey: 'roomId', as: 'room' });
  RoomPinnedArchive.belongsTo(models.RoomMessage, { foreignKey: 'messageId', as: 'message' });
  RoomPinnedArchive.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
};

module.exports = RoomPinnedArchive;
