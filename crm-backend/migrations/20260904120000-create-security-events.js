'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('security_events', {
      id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
      eventType: { type: Sequelize.STRING(50), allowNull: false },
      severity: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'warning' },
      ipAddress: { type: Sequelize.STRING(100), allowNull: true },
      origin: { type: Sequelize.STRING(500), allowNull: true },
      host: { type: Sequelize.STRING(255), allowNull: true },
      method: { type: Sequelize.STRING(12), allowNull: true },
      path: { type: Sequelize.STRING(500), allowNull: true },
      statusCode: { type: Sequelize.INTEGER, allowNull: true },
      username: { type: Sequelize.STRING(160), allowNull: true },
      userAgent: { type: Sequelize.STRING(1000), allowNull: true },
      details: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      occurredAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('security_events', ['occurredAt'], { name: 'security_events_occurred_idx' });
    await queryInterface.addIndex('security_events', ['eventType', 'occurredAt'], { name: 'security_events_type_occurred_idx' });
    await queryInterface.addIndex('security_events', ['ipAddress', 'occurredAt'], { name: 'security_events_ip_occurred_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('security_events');
  },
};
