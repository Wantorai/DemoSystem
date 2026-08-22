const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const BossMessageReaction = sequelize.define(
  'BossMessageReaction',
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
    tableName: 'boss_message_reactions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['messageId', 'userId'], name: 'idx_boss_reactions_message_user_unique' },
      { fields: ['messageId'], name: 'idx_boss_reactions_message_id' },
      { fields: ['userId'], name: 'idx_boss_reactions_user_id' },
    ],
  }
);

BossMessageReaction.associate = (models) => {
  BossMessageReaction.belongsTo(models.BossMessage, {
    foreignKey: 'messageId',
    as: 'message',
    onDelete: 'CASCADE',
  });
  BossMessageReaction.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user',
    onDelete: 'CASCADE',
  });
};

module.exports = BossMessageReaction;
