'use strict';


module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('max_messages', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      mChatId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'max_chats',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      maxMessageId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      fromMe: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
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
    await queryInterface.dropTable('max_messages');
  },
};

