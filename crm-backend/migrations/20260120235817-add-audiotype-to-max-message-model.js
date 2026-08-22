'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('max_messages', 'attachments', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addColumn('max_messages', 'messageType', {
      type: Sequelize.ENUM('text', 'audio', 'image', 'document'),
      allowNull: false,
      defaultValue: 'text',
    });
    await queryInterface.changeColumn('max_messages', 'text', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: '',
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('max_messages', 'attachments');
    await queryInterface.removeColumn('max_messages', 'messageType');
    await queryInterface.changeColumn('max_messages', 'text', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  }
};