const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RoomExternalParticipant = sequelize.define('RoomExternalParticipant', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  roomId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Rooms', key: 'id' },
    onDelete: 'CASCADE',
  },
  kind: {
    type: DataTypes.ENUM('telegram', 'max'),
    allowNull: false,
  },
  externalChatId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  externalUserId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  invitedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
  },
  linkedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'room_external_participants',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['roomId', 'kind', 'externalChatId'],
      name: 'room_external_participants_room_kind_chat_unique',
    },
    { fields: ['kind', 'externalChatId'], name: 'room_external_participants_kind_chat_idx' },
  ],
});

module.exports = RoomExternalParticipant;
