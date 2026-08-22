const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const RoomMessageReaction = sequelize.define(
  'RoomMessageReaction',
  {
    messageId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    emoji: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
  },
  {
    tableName: 'room_message_reactions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['messageId', 'userId'], name: 'idx_room_reactions_message_user_unique' },
      { fields: ['messageId'], name: 'idx_room_reactions_message_id' },
      { fields: ['userId'], name: 'idx_room_reactions_user_id' },
    ],
  }
);

RoomMessageReaction.associate = (models) => {
  RoomMessageReaction.belongsTo(models.RoomMessage, {
    foreignKey: 'messageId',
    as: 'message',
    onDelete: 'CASCADE',
  });
  RoomMessageReaction.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user',
    onDelete: 'CASCADE',
  });
};

module.exports = RoomMessageReaction;
