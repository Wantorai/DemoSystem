'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('max_chats', 'botType', {
      type: Sequelize.ENUM('business', 'personal'),
      allowNull: false,
      defaultValue: 'business',
    });

    await queryInterface.addIndex('max_chats', ['botType', 'assigneeId'], {
      name: 'max_chats_bot_type_assignee_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('max_chats', 'max_chats_bot_type_assignee_id_idx');
    await queryInterface.removeColumn('max_chats', 'botType');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_max_chats_botType";');
  },
};
