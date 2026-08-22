// models/BossChat.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const BossChat = sequelize.define('BossChat', {
  // Sequelize автоматически создаст поле id (INTEGER, AUTO_INCREMENT, PK)
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  mode: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  retentionDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 360,
  },
}, {
  tableName: 'boss_chats',
  // по умолчанию timestamps: true → createdAt, updatedAt
});

BossChat.associate = (models) => {
  BossChat.belongsToMany(models.User, {
    through: models.BossChatUsers,
    foreignKey: 'chatId',
    otherKey: 'userId',
  });
  BossChat.hasMany(models.BossMessage, {
    foreignKey: 'chatId',
  });
};

module.exports = BossChat;

