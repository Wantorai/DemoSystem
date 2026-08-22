'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SupportTickets', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      creatorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      creatorKey: {
        type: Sequelize.STRING(180),
        allowNull: false,
      },
      creatorName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      source: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'web',
      },
      title: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('new', 'in_progress', 'done'),
        allowNull: false,
        defaultValue: 'new',
      },
      attachmentUrl: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      attachmentName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      attachmentType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      adminComment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      resolvedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('SupportTickets', ['creatorUserId']);
    await queryInterface.addIndex('SupportTickets', ['creatorKey']);
    await queryInterface.addIndex('SupportTickets', ['status']);
    await queryInterface.addIndex('SupportTickets', ['createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SupportTickets');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_SupportTickets_status";');
  },
};
