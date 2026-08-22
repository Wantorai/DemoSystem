'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавляем поле 
    await queryInterface.addColumn('max_chats', 'assigneeId', {
      type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users', 
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    });

    // 
    await queryInterface.addColumn('max_chats', 'isClosed', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    });

  },

  async down(queryInterface, Sequelize) {
    // Удаляем добавленные поля при откате миграции
    await queryInterface.removeColumn('max_chats', 'assigneeId');
    await queryInterface.removeColumn('max_chats', 'isClosed');
  }
};