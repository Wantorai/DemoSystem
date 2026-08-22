'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('max_chats', 'unreadCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    
    await queryInterface.addColumn('max_chats', 'lastMessageText', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    
    await queryInterface.addColumn('max_chats', 'lastMessageTime', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('max_chats', 'unreadCount');
    await queryInterface.removeColumn('max_chats', 'lastMessageText');
    await queryInterface.removeColumn('max_chats', 'lastMessageTime');
  }
};
