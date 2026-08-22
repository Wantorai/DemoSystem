'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('telegram_chats', 'botType', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'business',
    });

    const constraints = await queryInterface.showConstraint('telegram_chats');
    const oldUnique = constraints.find((constraint) =>
      constraint.constraintType === 'UNIQUE'
      && Array.isArray(constraint.columnNames)
      && constraint.columnNames.length === 1
      && constraint.columnNames[0] === 'telegramChatId'
    );
    if (oldUnique?.constraintName) {
      await queryInterface.removeConstraint('telegram_chats', oldUnique.constraintName);
    }

    await queryInterface.addIndex('telegram_chats', ['botType', 'telegramChatId'], {
      unique: true,
      name: 'telegram_chats_bot_type_chat_id_unique',
    });
    await queryInterface.addIndex('telegram_chats', ['botType', 'assigneeId'], {
      name: 'telegram_chats_bot_type_assignee_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('telegram_chats', 'telegram_chats_bot_type_assignee_idx');
    await queryInterface.removeIndex('telegram_chats', 'telegram_chats_bot_type_chat_id_unique');
    await queryInterface.addIndex('telegram_chats', ['telegramChatId'], {
      unique: true,
      name: 'telegram_chats_telegram_chat_id_unique',
    });
    await queryInterface.removeColumn('telegram_chats', 'botType');
  },
};
