// models/Record.js

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

const Record = sequelize.define('Record', {
    requestDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      clientName: {
        type: DataTypes.STRING,
        allowNull: true,
      },      
      serviceRequired: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      serviceDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      serviceTime: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      paymentAmount: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      technicName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      statusId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'statuses_crm',
          key: 'id'
        }
      },
      noCallsAtOrderAccepted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      clientPhone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      secondCallDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      consultationDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      projectsReadyDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      priceAnnouncedDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      reminderCallDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      lastTalk: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    
      // --- Данные звонка ---
      callUuid: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      callDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      callType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      destinationNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      callerNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      callerName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      calleeNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      calleeName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      callDuration: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      callStatus: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      recordFileName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      telegramId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      reminderSent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      newParams: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      numberObjects: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      active: {  
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true, // По умолчанию консультация активна
      },      
    
    }, {
      tableName: 'records',
      timestamps: true,
    });

module.exports = Record;
