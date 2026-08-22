// models/Tele2Token.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Tele2Token = sequelize.define('Tele2Token', {
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  }
}, {
  tableName: 'tele2_tokens',
  timestamps: false,
});

module.exports = Tele2Token;
