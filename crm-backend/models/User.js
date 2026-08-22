// models/User.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    token: { type: DataTypes.STRING, allowNull: true }, // Токен для аутентификации
    phone: { type: DataTypes.STRING, allowNull: false }, // Телефон пользователя
    avatar: { type: DataTypes.STRING, allowNull: true },
    machineId: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    canChat: { type: DataTypes.BOOLEAN, defaultValue: true }, // Может ли быть в чатах
    canMax: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // Доступ к MAX чатам
    canTelegram: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // Доступ к Telegram чатам
    canWhatsApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // Доступ к WhatsApp чатам
    system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Системный пользователь скрыт от обычных personal-чатов
    autoCreatePersonalChats: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // Автосоздание personal-чатов при первом входе
    lastSeenAt: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'users',
    timestamps: false,
});

module.exports = User;
