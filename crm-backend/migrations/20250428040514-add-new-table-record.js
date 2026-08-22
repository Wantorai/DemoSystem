'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('records', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      requestDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      address: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      serviceRequired: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      serviceDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      serviceTime: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      paymentAmount: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      technicName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('Активен', 'Черновик', 'Завершен'),
        defaultValue: 'Активен',
      },
      calledByPhone: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      secondCallDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      consultationDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      projectsReadyDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      priceAnnouncedDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      reminderCallDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // --- Данные звонка ---
      callUuid: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      callDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      callType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      destinationNumber: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callerNumber: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callerName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      calleeNumber: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      calleeName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      callDuration: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      callStatus: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      recordFileName: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // Системные поля
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('records');
  }
};
