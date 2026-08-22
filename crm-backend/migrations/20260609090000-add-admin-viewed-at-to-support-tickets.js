'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SupportTickets', 'adminViewedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "SupportTickets" SET "adminViewedAt" = NOW() WHERE "adminViewedAt" IS NULL;'
    );
    await queryInterface.addIndex('SupportTickets', ['adminViewedAt'], {
      name: 'support_tickets_admin_viewed_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('SupportTickets', 'support_tickets_admin_viewed_at_idx');
    await queryInterface.removeColumn('SupportTickets', 'adminViewedAt');
  },
};
