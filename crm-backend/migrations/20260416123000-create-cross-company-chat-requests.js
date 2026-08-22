'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('cross_company_chat_requests', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      requesterUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      requesterName: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      requesterPhone: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      requesterDomain: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      targetDomain: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      targetPhone: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: '',
      },
      targetUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      targetUserName: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      direction: {
        type: Sequelize.ENUM('outbound', 'inbound'),
        allowNull: false,
        defaultValue: 'outbound',
      },
      decisionReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decidedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      roomId: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('cross_company_chat_requests', ['requesterUserId'], {
      name: 'idx_cross_chat_req_requester_user',
    });
    await queryInterface.addIndex('cross_company_chat_requests', ['targetUserId'], {
      name: 'idx_cross_chat_req_target_user',
    });
    await queryInterface.addIndex('cross_company_chat_requests', ['status'], {
      name: 'idx_cross_chat_req_status',
    });
    await queryInterface.addIndex('cross_company_chat_requests', ['targetDomain', 'targetPhone'], {
      name: 'idx_cross_chat_req_target_domain_phone',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('cross_company_chat_requests');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_cross_company_chat_requests_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_cross_company_chat_requests_direction";');
  },
};
