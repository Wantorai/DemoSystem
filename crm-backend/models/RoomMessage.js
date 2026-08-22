// models/RoomRoomMessage.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');
const { attachMessageEncryptionHooks } = require('../services/messageCrypto');

const RoomMessage = sequelize.define('RoomMessage', {
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'text',
  },
  mediaUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  fileSize: { type: DataTypes.BIGINT, allowNull: true },
  replyToMessageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'RoomMessages',
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
  thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
  duration: { type: DataTypes.INTEGER, allowNull: true },
  externalAuthorKind: { type: DataTypes.STRING, allowNull: true },
  externalAuthorName: { type: DataTypes.STRING, allowNull: true },
  externalAuthorId: { type: DataTypes.STRING, allowNull: true },

  clientId: { type: DataTypes.STRING, allowNull: true, unique: true },
  deliveryStatus: {
    type: DataTypes.ENUM('pending','sending','sent','failed'),
    allowNull: true,
    defaultValue: null,
  },
});

RoomMessage.associate = (models) => {
  RoomMessage.belongsTo(models.User, {
    foreignKey: 'userId',
    onDelete: 'CASCADE',
  });

  RoomMessage.belongsTo(models.Room, {
    foreignKey: 'roomId',
    onDelete: 'CASCADE',
  });

  RoomMessage.belongsTo(models.RoomMessage, {
    foreignKey: 'replyToMessageId',
    as: 'replyToMessage',
  });
};

module.exports = RoomMessage;

attachMessageEncryptionHooks(RoomMessage, ['content', 'transcriptionText']);








// // models/RoomRoomMessage.js
// const sequelize = require('../config/database');
// const { DataTypes } = require('sequelize');

// const RoomMessage = sequelize.define('RoomMessage', {
//   content: {
//     type: DataTypes.TEXT,
//     allowNull: true,
//   },
//     type: {
//     type: DataTypes.STRING,
//     allowNull: false,
//     defaultValue: 'text',
//   },
//   mediaUrl: {
//     type: DataTypes.STRING,
//     allowNull: true,
//   },
//   fileName: {
//     type: DataTypes.STRING,
//     allowNull: true,
//   },
//   replyToMessageId: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'RoomMessages', // имя таблицы
//       key: 'id',
//     },
//     onDelete: 'SET NULL',
//   },
// });

//   RoomMessage.associate = (models) => {
//     RoomMessage.belongsTo(models.User, {
//     foreignKey: 'userId',
//     onDelete: 'CASCADE',
//   });

//   RoomMessage.belongsTo(models.Room, {
//     foreignKey: 'roomId',
//     onDelete: 'CASCADE',
//   });

//   // Добавляем self-association
//   RoomMessage.belongsTo(models.RoomMessage, {
//     foreignKey: 'replyToMessageId',
//     as: 'replyToMessage',
//   });
// };

// module.exports = RoomMessage;
