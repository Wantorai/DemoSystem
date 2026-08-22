'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('boss_chats', 'retentionDays', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 360,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('boss_chats', 'retentionDays');
  },
};

