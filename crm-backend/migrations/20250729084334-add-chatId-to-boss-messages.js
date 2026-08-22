'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1) добавляем колонку chatId
    await queryInterface.addColumn('boss_messages', 'chatId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    // 2) навешиваем внешнее ограничение на boss_chats.id
    await queryInterface.addConstraint('boss_messages', {
      fields: ['chatId'],
      type: 'foreign key',
      name: 'fk_boss_messages_chatId',
      references: {
        table: 'boss_chats',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    // 3) если у вас в сообщениях ещё нет userId, аналогично добавьте его привязав к users.id
    await queryInterface.addColumn('boss_messages', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.addConstraint('boss_messages', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'fk_boss_messages_userId',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeConstraint('boss_messages', 'fk_boss_messages_userId');
    await queryInterface.removeColumn('boss_messages', 'userId');

    await queryInterface.removeConstraint('boss_messages', 'fk_boss_messages_chatId');
    await queryInterface.removeColumn('boss_messages', 'chatId');
  }
};
