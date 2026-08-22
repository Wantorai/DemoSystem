'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем поле senderName
    await queryInterface.addColumn('max_messages', 'senderName', {
      type: Sequelize.STRING,
      allowNull: true, // Разрешаем null для существующих сообщений
      defaultValue: null,
      comment: 'Имя отправителя сообщения (для отображения в интерфейсе)'
    });

    // Также можно добавить поле senderId для идентификации отправителя
    await queryInterface.addColumn('max_messages', 'senderId', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'ID отправителя (если нужна более точная идентификация)'
    });

  },

  async down(queryInterface, Sequelize) {
    // Удаляем добавленные поля при откате миграции
    await queryInterface.removeColumn('max_messages', 'senderName');
    await queryInterface.removeColumn('max_messages', 'senderId');
  }
};