'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (!table.lastSeenAt) {
      await queryInterface.addColumn('users', 'lastSeenAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (table.lastSeenAt) {
      await queryInterface.removeColumn('users', 'lastSeenAt');
    }
  },
};
