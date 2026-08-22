// models/Room.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

  const Room = sequelize.define('Room', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM('group', 'personal'),
      defaultValue: 'group',
      allowNull: false,
    },

    creatorUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

  });

  Room.associate = (models) => {
    Room.belongsToMany(models.User, {
      through: 'RoomUsers',
      foreignKey: 'roomId',
      otherKey: 'userId',
    });
  };


module.exports = Room;
