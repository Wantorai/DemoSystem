'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('external_message_reactions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      channel: { type: Sequelize.STRING(16), allowNull: false },
      messageId: { type: Sequelize.INTEGER, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      emoji: { type: Sequelize.STRING(32), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('external_message_reactions', ['channel', 'messageId', 'userId'], {
      unique: true,
      name: 'external_message_reactions_channel_message_user_unique',
    });
    await queryInterface.addIndex('external_message_reactions', ['channel', 'messageId'], {
      name: 'external_message_reactions_channel_message',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('external_message_reactions');
  },
};
