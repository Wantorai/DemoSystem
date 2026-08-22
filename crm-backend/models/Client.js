// // Модель клиента
// const { Model, DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// class Client extends Model {}

// Client.init(
//     {
//         name: {
//             type: DataTypes.STRING,
//             allowNull: false,
//         },
//         email: {
//             type: DataTypes.STRING,
//             allowNull: false,
//             unique: true,
//         },
//         phone: {
//             type: DataTypes.STRING,
//             allowNull: false,
//         },
//         representative: {
//             type: DataTypes.STRING, // Поле для имени представителя
//             allowNull: true,
//         },
//         representativePhone: {
//             type: DataTypes.STRING, // Поле для телефона представителя
//             allowNull: true,
//         },
//     },
//     {
//         sequelize,
//         modelName: 'Client',
//     }
// );



const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Client = sequelize.define('Client', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  representative: {
    type: DataTypes.STRING, // Имя представителя
    allowNull: true,
  },
  representativePhone: {
    type: DataTypes.STRING, // Телефон представителя
    allowNull: true,
  },
}, {
  tableName: 'clients',
  //timestamps: false, // Поля createdAt/updatedAt
  //freezeTableName: true, // Предотвращаем множественное число
});

module.exports = Client;
