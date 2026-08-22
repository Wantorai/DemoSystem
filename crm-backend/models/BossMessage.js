// models/BossMessage.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const { attachMessageEncryptionHooks } = require('../services/messageCrypto');

const BossMessage = sequelize.define('BossMessage', {
  content: { type: DataTypes.TEXT, allowNull: true },
  thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
  duration: { type: DataTypes.INTEGER, allowNull: true },
  type:    { type: DataTypes.STRING, allowNull: false, defaultValue: 'text' },
  mediaUrl:{ type: DataTypes.STRING, allowNull: true },
  fileName:{ type: DataTypes.STRING, allowNull: true },
  chatId:  { type: DataTypes.INTEGER, allowNull: false },
  userId:  { type: DataTypes.INTEGER, allowNull: false },
  createdAt:{ type: DataTypes.DATE, allowNull:false },
  fileSize: { type: DataTypes.BIGINT, allowNull: true },
  replyToMessageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'boss_messages', // имя таблицы
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
    // NEW fields for transcription
  transcriptionText: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  transcriptionStatus: {
    type: DataTypes.ENUM('pending', 'processing', 'done', 'failed'),
    allowNull: true,
    defaultValue: null,
  },
  transcriptionProvider: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  transcriptionConfidence: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  transcriptionError: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  transcribedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  clientId: { type: DataTypes.STRING, allowNull: true, unique: true }, // добавлено
  deliveryStatus: {
    type: DataTypes.ENUM('pending','sending','sent','failed'),
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: 'boss_messages',
  timestamps: false,
});

  BossMessage.associate = (models) => {
    BossMessage.belongsTo(models.BossMessage, {
      foreignKey: 'replyToMessageId',
      as: 'replyToMessage',
    });
  };

module.exports = BossMessage;

attachMessageEncryptionHooks(BossMessage, ['content', 'transcriptionText']);



// const BossMessage = sequelize.define('BossMessage', {

//     id: {
//       type: DataTypes.UUID,
//       allowNull: false,
//       primaryKey: true,
//     },
//     text: {
//       type: DataTypes.TEXT,
//       allowNull: true,
//     },
//     messageType: {
//       type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'document', 'other'),
//       allowNull: false,
//       defaultValue: 'text',
//     },
//     mediaUrl: {
//       type: DataTypes.STRING,
//       allowNull: true,
//     },
//     fileName: {
//       type: DataTypes.STRING,
//       allowNull: true,
//     },
//     createdAt: {
//         type: DataTypes.DATE,
//         allowNull: false,
//     },
//       chatId: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//   },
//   }, {
//   tableName: 'boss_messages',
//   timestamps: false,
// });

// BossMessage.associate = (models) => {
//   // связь с чатом
//   BossMessage.belongsTo(models.BossChat, {
//     foreignKey: 'chatId',
//     as: 'chat',
//   });
//   // связь с пользователем-отправителем
//   BossMessage.belongsTo(models.User, {
//     foreignKey: 'userId',
//     as: 'sender',
//   });
// };


