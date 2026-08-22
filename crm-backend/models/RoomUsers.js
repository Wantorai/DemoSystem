// models/RoomUsers.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');


  const RoomUsers = sequelize.define('RoomUsers', {
    roomId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    lastReadMessageId: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    timestamps: false,
  });


module.exports = RoomUsers;
