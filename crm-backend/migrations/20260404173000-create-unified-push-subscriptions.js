'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('unified_push_subscriptions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      endpoint: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      p256dh: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      auth: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      instance: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      distributorId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('unified_push_subscriptions', ['userId'], {
      name: 'idx_unified_push_subscriptions_user_id',
    });

    await queryInterface.addIndex('unified_push_subscriptions', ['instance'], {
      name: 'idx_unified_push_subscriptions_instance',
    });

    await queryInterface.addIndex('unified_push_subscriptions', ['userId', 'instance', 'endpoint'], {
      unique: true,
      name: 'idx_unified_push_subscriptions_user_instance_endpoint_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('unified_push_subscriptions');
  },
};

