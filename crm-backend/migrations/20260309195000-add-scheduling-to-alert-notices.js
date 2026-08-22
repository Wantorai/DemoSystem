'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('alert_notices');

    if (!table.scheduledFor) {
      await queryInterface.addColumn('alert_notices', 'scheduledFor', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      });
    }

    if (!table.publishedAt) {
      await queryInterface.addColumn('alert_notices', 'publishedAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.lastSentAt) {
      await queryInterface.addColumn('alert_notices', 'lastSentAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    const indexes = await queryInterface.showIndex('alert_notices');
    const names = new Set((indexes || []).map((idx) => idx.name));

    if (!names.has('idx_alert_notices_active_published_at')) {
      await queryInterface.addIndex('alert_notices', ['isActive', 'publishedAt'], {
        name: 'idx_alert_notices_active_published_at',
      });
    }

    if (!names.has('idx_alert_notices_active_scheduled_for')) {
      await queryInterface.addIndex('alert_notices', ['isActive', 'scheduledFor'], {
        name: 'idx_alert_notices_active_scheduled_for',
      });
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('alert_notices');
    const names = new Set((indexes || []).map((idx) => idx.name));

    if (names.has('idx_alert_notices_active_scheduled_for')) {
      await queryInterface.removeIndex('alert_notices', 'idx_alert_notices_active_scheduled_for');
    }

    if (names.has('idx_alert_notices_active_published_at')) {
      await queryInterface.removeIndex('alert_notices', 'idx_alert_notices_active_published_at');
    }

    const table = await queryInterface.describeTable('alert_notices');

    if (table.lastSentAt) {
      await queryInterface.removeColumn('alert_notices', 'lastSentAt');
    }

    if (table.publishedAt) {
      await queryInterface.removeColumn('alert_notices', 'publishedAt');
    }

    if (table.scheduledFor) {
      await queryInterface.removeColumn('alert_notices', 'scheduledFor');
    }
  },
};
