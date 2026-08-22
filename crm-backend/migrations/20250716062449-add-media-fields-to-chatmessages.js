'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ChatMessage
    await queryInterface.addColumn('chat_messages', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'text',
    });
    await queryInterface.addColumn('chat_messages', 'mediaUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('chat_messages', 'fileName', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Изменяем content: allowNull: true
    await queryInterface.changeColumn('chat_messages', 'text', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // RoomMessage
    await queryInterface.addColumn('RoomMessages', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'text',
    });
    await queryInterface.addColumn('RoomMessages', 'mediaUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('RoomMessages', 'fileName', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    // Изменяем content: allowNull: true
    await queryInterface.changeColumn('RoomMessages', 'content', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('chat_messages', 'type');
    await queryInterface.removeColumn('chat_messages', 'mediaUrl');
    await queryInterface.removeColumn('chat_messages', 'fileName');
    await queryInterface.changeColumn('chat_messages', 'text', {
      type: Sequelize.TEXT,
      allowNull: false,
    });

    await queryInterface.removeColumn('RoomMessages', 'type');
    await queryInterface.removeColumn('RoomMessages', 'mediaUrl');
    await queryInterface.removeColumn('RoomMessages', 'fileName');
    await queryInterface.changeColumn('RoomMessages', 'content', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  }
};
