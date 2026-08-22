// models/Paylist.js
const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Paylist = sequelize.define('Paylist', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'paylist',
  //timestamps: false,
});

module.exports = Paylist;