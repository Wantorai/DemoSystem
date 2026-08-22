'use strict';

/** @type {import('sequelize-cli').Migration} */


module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Удаляем старое ENUM-поле "status", если оно существует
    await queryInterface.removeColumn('records', 'status');

    // 2. Добавляем новое поле statusId
    await queryInterface.addColumn('records', 'statusId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'statuses_crm',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // 1. Удаляем поле statusId
    await queryInterface.removeColumn('records', 'statusId');

    // 2. Возвращаем ENUM-поле status
    await queryInterface.addColumn('records', 'status', {
      type: Sequelize.ENUM('Активен', 'Черновик', 'Завершен'),
      allowNull: true,
      defaultValue: 'Активен'
    });
  }
};