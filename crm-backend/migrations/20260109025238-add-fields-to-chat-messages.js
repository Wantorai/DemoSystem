'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.addColumn('chat_messages', 'transcriptionText', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('chat_messages', 'transcriptionStatus', {
      type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('chat_messages', 'transcribedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('chat_messages', 'deliveryStatus', {
      type: Sequelize.ENUM('pending', 'sending', 'sent', 'failed'),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('chat_messages', 'deliveryStatus');
    await queryInterface.removeColumn('chat_messages', 'transcribedAt');
    await queryInterface.removeColumn('chat_messages', 'transcriptionStatus');
    await queryInterface.removeColumn('chat_messages', 'transcriptionText');

    // ⚠️ обязательно удаляем ENUM-типы в PostgreSQL
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_chat_messages_transcriptionStatus";'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_chat_messages_deliveryStatus";'
    );
  },
};
