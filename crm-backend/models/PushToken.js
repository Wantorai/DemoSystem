const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const PushToken = sequelize.define('PushToken', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: false }, // Expo Push Token
    provider: { type: DataTypes.STRING(32), allowNull: true },
    platform: { type: DataTypes.STRING(32), allowNull: true },
    manufacturer: { type: DataTypes.STRING(100), allowNull: true },
    modelName: { type: DataTypes.STRING(150), allowNull: true },
    osVersion: { type: DataTypes.STRING(50), allowNull: true },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: 'push_tokens',
    timestamps: false,
    indexes: [
        { fields: ['userId'] },
        { unique: true, fields: ['token'] }, // Чтобы один токен не дублировался
    ],
});

module.exports = PushToken;
