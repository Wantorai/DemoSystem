'use strict';


module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('max_chats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      maxChatId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      maxUserId: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      username: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('max_chats');
  },
};

