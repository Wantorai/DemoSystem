const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const UserSetting = sequelize.define(
  'UserSetting',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    key: { type: DataTypes.STRING(120), allowNull: false },
    value: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'user_settings',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { unique: true, fields: ['userId', 'key'], name: 'user_settings_user_key_unique' },
    ],
  }
);

module.exports = UserSetting;
